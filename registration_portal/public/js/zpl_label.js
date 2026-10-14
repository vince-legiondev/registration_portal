frappe.ui.form.on("ZPL Label", {
	setup(frm) {
		frm.set_query("registration_program", () => ({ filters: { docstatus: 1 } }));
	},
	refresh(frm) {
		zpl_label_setup_preview(frm);
		zpl_label_load_program_fields(frm);
	},
	registration_program(frm) {
		zpl_label_load_program_fields(frm);
	},
	density: zpl_label_schedule_preview,
	label_width: zpl_label_schedule_preview,
	label_height: zpl_label_schedule_preview,
	units: zpl_label_schedule_preview,
});

function zpl_label_load_program_fields(frm) {
	if (!frm.doc.registration_program) {
		frm.__zpl_registration_fields = [];
		frm.fields_dict.mapping_help.$wrapper.html(
			"<div class='text-muted'>Select a Registration Program to load its available placeholders.</div>"
		);
		return;
	}
	frappe.call({
		method: "registration_portal.zpl_studio.doctype.zpl_label.zpl_label.get_registration_fields",
		args: { registration_program: frm.doc.registration_program },
		callback: (response) => {
			const fields = response.message || [];
			frm.__zpl_registration_fields = fields;
			const examples = fields
				.map(
					(field) =>
						`<code>{{ ${frappe.utils.escape_html(field.fieldname)} }}</code> <span>${frappe.utils.escape_html(field.label)}</span>`
				)
				.join("<br>");
			frm.fields_dict.mapping_help.$wrapper.html(
				`<div class="text-muted">Use any listed placeholder directly in your ZPL where the value should print.<div class="zpl-field-examples">${examples}</div></div>`
			);
		},
	});
}

function zpl_label_setup_preview(frm) {
	frm.fields_dict.settings_heading.$wrapper.html('<div class="zpl-settings-heading">Preview Settings</div>');
	if (!frm.__zpl_preview_initialized) {
		frm.__zpl_preview_initialized = true;
		frm.fields_dict.label_preview.$wrapper.html(`
			<div class="zpl-form-preview">
				<div class="zpl-form-preview-toolbar">
					<span class="zpl-form-preview-status">Type ZPL to see a preview</span>
					<button type="button" class="btn btn-default btn-xs zpl-form-preview-redraw">Redraw</button>
				</div>
				<div class="zpl-form-preview-stage">
					<div class="zpl-form-preview-loading" hidden><span></span>Rendering label…</div>
					<div class="zpl-form-preview-message">Your rendered label will appear here.</div>
					<img class="zpl-form-preview-image" alt="Rendered ZPL label" hidden>
				</div>
				<div class="zpl-form-preview-note">Preview is rendered by Labelary. ZPL code is sent to Labelary when you render.</div>
			</div>
		`);
		frm.fields_dict.label_preview.$wrapper.on("click", ".zpl-form-preview-redraw", () => zpl_label_render_preview(frm));
	}

	if (!frm.__zpl_preview_editor_bound) {
		zpl_label_wait_for_editor(frm, 0);
	}

	zpl_label_schedule_preview(frm);
}

function zpl_label_wait_for_editor(frm, attempt) {
	const field = frm.fields_dict.zpl_code;
	if (field?.editor?.session) {
		frm.__zpl_preview_editor_bound = true;
		field.editor.session.on("change", () => zpl_label_schedule_preview(frm));
		return;
	}
	if (attempt < 40 && frm.fields_dict.label_preview) {
		setTimeout(() => zpl_label_wait_for_editor(frm, attempt + 1), 150);
	}
}

function zpl_label_schedule_preview(frm) {
	if (!frm.fields_dict.label_preview) return;
	clearTimeout(frm.__zpl_preview_timer);
	frm.fields_dict.label_preview.$wrapper.find(".zpl-form-preview-status").text("Waiting for edits…");
	frm.__zpl_preview_timer = setTimeout(() => zpl_label_render_preview(frm), 650);
}

async function zpl_label_render_preview(frm) {
	const code = frm.fields_dict.zpl_code?.editor?.getValue() || frm.doc.zpl_code || "";
	const status = frm.fields_dict.label_preview.$wrapper.find(".zpl-form-preview-status");
	const stage = frm.fields_dict.label_preview.$wrapper.find(".zpl-form-preview-stage");
	if (!code.trim()) {
		stage.find(".zpl-form-preview-loading, .zpl-form-preview-image").prop("hidden", true);
		stage.find(".zpl-form-preview-message").text("Enter ZPL code to render a label.").prop("hidden", false);
		status.text("Waiting for ZPL code");
		return;
	}

	const densityMap = { "6 dpmm (152 dpi)": 6, "8 dpmm (203 dpi)": 8, "12 dpmm (300 dpi)": 12, "24 dpmm (600 dpi)": 24 };
	const density = densityMap[frm.doc.density] || 8;
	const units = frm.doc.units || "inches";
	const scale = units === "mm" ? 1 / 25.4 : units === "cm" ? 1 / 2.54 : 1;
	const width = (Number(frm.doc.label_width || 4) * scale).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
	const height = (Number(frm.doc.label_height || 6) * scale).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
	const field = frm.fields_dict.label_preview;
	if (frm.__zpl_preview_request) frm.__zpl_preview_request.abort();
	frm.__zpl_preview_request = new AbortController();
	stage.find(".zpl-form-preview-loading").prop("hidden", false);
	stage.find(".zpl-form-preview-message").prop("hidden", true);
	status.text("Rendering with Labelary…");

	try {
		const response = await fetch(`https://api.labelary.com/v1/printers/${density}dpmm/labels/${width}x${height}/0/`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "image/png" },
			body: code,
			signal: frm.__zpl_preview_request.signal,
		});
		if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
		const imageUrl = URL.createObjectURL(await response.blob());
		if (frm.__zpl_preview_image_url) URL.revokeObjectURL(frm.__zpl_preview_image_url);
		frm.__zpl_preview_image_url = imageUrl;
		stage.find(".zpl-form-preview-loading").prop("hidden", true);
		stage.find(".zpl-form-preview-message").prop("hidden", true);
		stage.find(".zpl-form-preview-image").attr("src", imageUrl).prop("hidden", false);
		status.text("Preview updated");
	} catch (error) {
		if (error.name === "AbortError") return;
		stage.find(".zpl-form-preview-loading").prop("hidden", true);
		stage.find(".zpl-form-preview-image").prop("hidden", true);
		stage.find(".zpl-form-preview-message").text(error.message || "Could not render this ZPL label.").prop("hidden", false);
		status.text("Preview failed");
	}
}

if (!document.getElementById("zpl-label-preview-styles")) {
	const style = document.createElement("style");
	style.id = "zpl-label-preview-styles";
	style.textContent = `
		.zpl-form-preview { margin: 0 0 16px; }
		.zpl-form-preview-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; color:var(--text-muted,#687385); font-size:12px; }
		.zpl-form-preview-stage { position:relative; display:flex; min-height:360px; align-items:center; justify-content:center; overflow:auto; padding:26px; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; background-color:#f3f5f8; background-image:linear-gradient(45deg,#e9edf2 25%,transparent 25%),linear-gradient(-45deg,#e9edf2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9edf2 75%),linear-gradient(-45deg,transparent 75%,#e9edf2 75%); background-position:0 0,0 8px,8px -8px,-8px 0; background-size:16px 16px; }
		.zpl-form-preview-image { display:block; max-width:100%; max-height:70vh; object-fit:contain; background:#fff; box-shadow:0 4px 20px #14213a26; }
		.zpl-form-preview-message { max-width:420px; color:var(--text-muted,#778196); font-size:13px; text-align:center; }
		.zpl-form-preview-loading { position:absolute; top:12px; left:50%; display:flex; align-items:center; gap:8px; transform:translateX(-50%); padding:7px 11px; border:1px solid var(--border-color,#e5e7eb); border-radius:20px; background:var(--card-bg,#fff); color:var(--text-muted,#687385); box-shadow:0 2px 8px #17203312; font-size:11px; }
		.zpl-form-preview-loading[hidden],.zpl-form-preview-image[hidden],.zpl-form-preview-message[hidden] { display:none; }
		.zpl-form-preview-loading span { width:12px;height:12px;border:2px solid #dce3f3;border-top-color:#4a6ee7;border-radius:50%;animation:zpl-form-preview-spin .7s linear infinite; }
		@keyframes zpl-form-preview-spin { to { transform:rotate(360deg); } }
		.zpl-form-preview-note { margin-top:7px; color:var(--text-muted,#9099a8); font-size:10px; }
		.zpl-settings-heading { margin:0 0 14px; padding:7px 0 9px; border-bottom:1px solid var(--border-color,#e5e7eb); color:var(--text-color,#263249); font-size:14px; font-weight:600; }
		.zpl-field-examples { margin-top:8px; line-height:1.9; }
		.zpl-field-examples code { margin-right:4px; }
	`;
	document.head.appendChild(style);
}
