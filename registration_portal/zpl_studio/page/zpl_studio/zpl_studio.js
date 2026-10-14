frappe.pages["zpl-studio"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("ZPL Studio"), single_column: true });
	page.main.addClass("zpl-studio-page");
	new ZPLStudio(page);
};

class ZPLStudio {
	constructor(page) {
		this.page = page;
		this.root = $(page.body).find(".zpl-studio-root");
		this.name = null;
		this.objectUrl = null;
		this.timer = null;
		this.request = null;
		this.format = "png";
		this.zpl = `^XA
^PW812
^LL1218
^FO50,50^A0N,48,48^FDHello, Zebra!^FS
^FO50,130^A0N,28,28^FDYour ZPL label is ready.^FS
^FO50,220^BY3
^BCN,120,Y,N,N
^FD1234567890^FS
^FO50,400^BQN,2,6
^FDLA,https://example.com^FS
^XZ`;
		this.inject_styles();
		this.render();
		this.setup_actions();
		this.refresh_saved();
		this.load_programs();
		this.schedule_render(0);
	}

	setup_actions() {
		this.page.set_primary_action(__("Save label"), () => this.save());
		this.page.add_menu_item(__("New label"), () => this.new_label());
		this.page.add_menu_item(__("Download ZPL"), () => this.download("zpl"));
		this.page.add_menu_item(__("Download rendered file"), () => this.download(this.format));
		this.page.add_menu_item(__("About Labelary preview"), () => frappe.msgprint(__("To render a preview, this page sends the current ZPL to the Labelary API. Avoid including sensitive data in labels.")));
	}

	inject_styles() {
		if (document.getElementById("zpl-studio-styles")) return;
		const style = document.createElement("style");
		style.id = "zpl-studio-styles";
		style.textContent = ZPL_STUDIO_CSS;
		document.head.appendChild(style);
	}

	render() {
		this.root.html(`
			<div class="zs-layout">
				<aside class="zs-sidebar">
					<div class="zs-brand"><div class="zs-mark">Z</div><div><strong>ZPL Studio</strong><small>Label designer</small></div></div>
					<button class="btn btn-primary btn-sm zs-new">${__("New label")}</button>
					<div class="zs-sidebar-heading">${__("SAVED LABELS")}<button class="zs-refresh" title="Refresh">↻</button></div>
					<div class="zs-saved-list"><div class="zs-empty-saved">${__("Loading labels…")}</div></div>
					<div class="zs-sidebar-note"><span class="zs-status-dot"></span>${__("Browser preview powered by Labelary")}</div>
				</aside>
				<main class="zs-main">
					<header class="zs-topbar"><div><div class="zs-eyebrow">${__("LABEL DESIGNER")}</div><input class="zs-title" value="Untitled label" aria-label="Label name"></div>
						<div class="zs-top-actions"><span class="zs-save-state">${__("Unsaved changes")}</span><button class="btn btn-default btn-sm zs-download-zpl">${__("Download ZPL")}</button><button class="btn btn-primary btn-sm zs-save">${__("Save label")}</button></div>
					</header>
					<section class="zs-settings">
						<div class="zs-control"><label>${__("Registration Program")}</label><select class="form-control input-sm zs-registration-program"><option value="">${__("Select a Registration Program")}</option></select></div>
						<div class="zs-control"><label>${__("Print ID")}</label><label class="zs-enabled-toggle"><input class="zs-enabled-for-print" type="checkbox" checked> ${__("Enabled")}</label></div>
						<div class="zs-control"><label>${__("Print density")}</label><select class="form-control input-sm zs-density"><option value="6">6 dpmm · 152 dpi</option><option value="8" selected>8 dpmm · 203 dpi</option><option value="12">12 dpmm · 300 dpi</option><option value="24">24 dpmm · 600 dpi</option></select></div>
						<div class="zs-control zs-size-control"><label>${__("Label size")}</label><div class="zs-size"><input class="form-control input-sm zs-width" type="number" min="0.1" step="0.1" value="4"><span>×</span><input class="form-control input-sm zs-height" type="number" min="0.1" step="0.1" value="6"><select class="form-control input-sm zs-units"><option>inches</option><option>mm</option><option>cm</option></select></div></div>
						<div class="zs-control zs-index-control"><label>${__("Show label")}</label><div class="zs-index"><input class="form-control input-sm zs-index-value" type="number" min="0" value="0"><span>/</span><span class="zs-index-total">1</span></div></div>
						<div class="zs-control zs-redraw-control"><label>&nbsp;</label><button class="btn btn-default btn-sm zs-redraw">↻ &nbsp;${__("Redraw")}</button></div>
					</section>
					<section class="zs-field-reference"><strong>${__("Available Registration Placeholders")}</strong><div class="zs-field-list">${__("Select a Registration Program to see available fields.")}</div></section>
					<div class="zs-workspace">
						<section class="zs-editor-panel"><div class="zs-panel-head"><div><strong>${__("ZPL source")}</strong><span class="zs-subtle">${__("Edit your printer commands")}</span></div><span class="zs-line-count">${__("Ready")}</span></div>
							<div class="zs-editor"><div class="zs-gutter"></div><textarea class="zs-code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="ZPL source code"></textarea></div>
							<div class="zs-editor-foot"><span>${__("Tip: click a command to see its reference")}</span><span class="zs-validation">${__("No warnings")}</span></div>
							<div class="zs-command-help"><strong>${__("ZPL quick reference")}</strong><span class="zs-help-text">${__("Select a command to see a short description.")}</span></div>
						</section>
						<section class="zs-preview-panel"><div class="zs-panel-head"><div><strong>${__("Label preview")}</strong><span class="zs-subtle zs-preview-size">4 × 6 inches</span></div><div class="zs-formats"><button class="active" data-format="png">PNG</button><button data-format="pdf">PDF</button><button data-format="epl">EPL</button></div></div>
							<div class="zs-preview-stage"><div class="zs-preview-loading" hidden><span class="zs-spinner"></span>${__("Rendering label…")}</div><div class="zs-preview-message">${__("Preview appears here")}</div><img class="zs-preview-image" alt="Rendered ZPL label" hidden><iframe class="zs-preview-pdf" title="Rendered label PDF" hidden></iframe><pre class="zs-preview-text" hidden></pre></div>
							<div class="zs-preview-foot"><span class="zs-render-state">${__("Preview is up to date")}</span><span>${__("ZPL is sent to Labelary for preview")} · <a href="https://labelary.com/viewer.html" target="_blank" rel="noopener noreferrer">${__("About") } ↗</a></span></div>
						</section>
					</div>
					<footer class="zs-footer"><span>^XA <span>start label</span></span><span>^FO <span>field origin</span></span><span>^FD <span>field data</span></span><span>^FS <span>end field</span></span><span>^XZ <span>end label</span></span></footer>
				</main>
			</div>`);
		this.$code = this.root.find(".zs-code");
		this.$code.val(this.zpl);
		this.update_gutter();
		this.bind_events();
	}

	bind_events() {
		this.root.on("click", ".zs-new", () => this.new_label());
		this.root.on("click", ".zs-refresh", () => this.refresh_saved());
		this.root.on("click", ".zs-save", () => this.save());
		this.root.on("click", ".zs-download-zpl", () => this.download("zpl"));
		this.root.on("click", ".zs-redraw", () => this.render_preview());
		this.root.on("click", ".zs-saved-item", (e) => this.open($(e.currentTarget).data("name")));
		this.root.on("input", ".zs-code, .zs-title", (e) => { this.mark_unsaved(); if ($(e.currentTarget).hasClass("zs-code")) { this.update_gutter(); this.schedule_render(); } });
		this.root.on("input change", ".zs-density, .zs-width, .zs-height, .zs-units, .zs-index-value", () => { this.mark_unsaved(); this.update_size_label(); this.schedule_render(); });
		this.root.on("change", ".zs-registration-program", () => { this.mark_unsaved(); this.load_registration_fields(this.root.find(".zs-registration-program").val()); });
		this.root.on("change", ".zs-enabled-for-print", () => this.mark_unsaved());
		this.root.on("scroll", ".zs-code", () => this.root.find(".zs-gutter").scrollTop(this.$code.scrollTop()));
		this.root.on("click keyup", ".zs-code", () => this.show_command_help());
		this.root.on("click", ".zs-formats button", (e) => { this.format = $(e.currentTarget).data("format"); this.root.find(".zs-formats button").removeClass("active"); $(e.currentTarget).addClass("active"); this.schedule_render(0); });
		this.root.on("keydown", ".zs-code", (e) => {
			if (e.key === "Tab") { e.preventDefault(); const el = e.currentTarget; const start = el.selectionStart; const end = el.selectionEnd; el.value = el.value.substring(0, start) + "  " + el.value.substring(end); el.selectionStart = el.selectionEnd = start + 2; this.$code.trigger("input"); }
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); this.save(); }
		});
	}

	get_settings() { return { density: this.root.find(".zs-density").val(), width: this.root.find(".zs-width").val(), height: this.root.find(".zs-height").val(), units: this.root.find(".zs-units").val(), index: this.root.find(".zs-index-value").val() || 0 }; }

	async load_programs(selected = "") {
		const select = this.root.find(".zs-registration-program");
		try {
			const programs = await frappe.db.get_list("Registration Program", {
				filters: { docstatus: 1 }, fields: ["name"], order_by: "name asc", limit: 500,
			});
			select.html(`<option value="">${__("Select a Registration Program")}</option>${programs.map((program) => `<option value="${frappe.utils.escape_html(program.name)}">${frappe.utils.escape_html(program.name)}</option>`).join("")}`);
			if (selected) select.val(selected);
			await this.load_registration_fields(select.val());
		} catch (_error) {
			this.root.find(".zs-field-list").text(__("Could not load Registration Programs."));
		}
	}

	async load_registration_fields(program) {
		const target = this.root.find(".zs-field-list");
		if (!program) { target.text(__("Select a Registration Program to see available fields.")); return; }
		try {
			const response = await frappe.call({
				method: "registration_portal.zpl_studio.doctype.zpl_label.zpl_label.get_registration_fields",
				args: { registration_program: program },
			});
			const fields = response.message || [];
			target.html(fields.map((field) => `<span class="zs-field-token"><code>{{ ${frappe.utils.escape_html(field.fieldname)} }}</code> ${frappe.utils.escape_html(field.label)}</span>`).join(""));
		} catch (_error) {
			target.text(__("Could not load fields for this Registration Program."));
		}
	}

	update_size_label() { const s = this.get_settings(); this.root.find(".zs-preview-size").text(`${s.width} × ${s.height} ${s.units}`); }

	update_gutter() {
		const count = Math.max(1, this.$code.val().split("\n").length);
		this.root.find(".zs-gutter").html(Array.from({ length: count }, (_, i) => `<span>${i + 1}</span>`).join(""));
		this.root.find(".zs-line-count").text(`${count} ${__("lines")} · ${this.$code.val().length} ${__("chars")}`);
	}

	mark_unsaved() { this.root.find(".zs-save-state").text(__("Unsaved changes")).removeClass("is-saved"); }

	schedule_render(delay = 550) { clearTimeout(this.timer); this.root.find(".zs-render-state").text(__("Waiting for edits…")); this.timer = setTimeout(() => this.render_preview(), delay); }

	async render_preview() {
		const zpl = this.$code.val().trim();
		if (!zpl) { this.show_preview_message(__("Enter ZPL code to render a label.")); return; }
		const s = this.get_settings();
		const unitsFactor = s.units === "mm" ? 1 / 25.4 : s.units === "cm" ? 1 / 2.54 : 1;
		const width = (Number(s.width) * unitsFactor).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		const height = (Number(s.height) * unitsFactor).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		const apiFormat = this.format === "png" ? "image/png" : this.format === "pdf" ? "application/pdf" : "application/epl";
		const endpoint = `https://api.labelary.com/v1/printers/${s.density}dpmm/labels/${width}x${height}/${Math.max(0, Number(s.index) || 0)}/`;
		if (this.request) this.request.abort();
		this.request = new AbortController();
		this.root.find(".zs-preview-loading").prop("hidden", false);
		this.root.find(".zs-preview-message").prop("hidden", true);
		this.root.find(".zs-render-state").text(__("Rendering with Labelary…"));
		try {
			const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: apiFormat }, body: zpl, signal: this.request.signal });
			if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
			const blob = await response.blob();
			if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = URL.createObjectURL(blob);
			this.root.find(".zs-preview-loading").prop("hidden", true);
			this.root.find(".zs-preview-image, .zs-preview-pdf, .zs-preview-text").prop("hidden", true);
			if (this.format === "png") this.root.find(".zs-preview-image").attr("src", this.objectUrl).prop("hidden", false);
			else if (this.format === "pdf") this.root.find(".zs-preview-pdf").attr("src", this.objectUrl).prop("hidden", false);
			else this.root.find(".zs-preview-text").text(await blob.text()).prop("hidden", false);
			this.root.find(".zs-index-total").text(response.headers.get("X-Total-Count") || "1");
			this.root.find(".zs-render-state").text(__("Preview updated"));
		} catch (error) {
			if (error.name === "AbortError") return;
			this.root.find(".zs-preview-loading").prop("hidden", true);
			this.show_preview_message(error.message || __("Could not reach the Labelary API. Check your connection and try again."), true);
		}
	}

	show_preview_message(message, isError = false) { this.root.find(".zs-preview-image, .zs-preview-pdf, .zs-preview-text").prop("hidden", true); this.root.find(".zs-preview-message").text(message).toggleClass("is-error", isError).prop("hidden", false); if (isError) this.root.find(".zs-render-state").text(__("Preview failed")); }

	show_command_help() {
		const el = this.$code[0]; const before = el.value.slice(0, el.selectionStart); const match = before.match(/\^([A-Z0-9~]{2,3})[^\^]*$/i); const command = match ? match[1].toUpperCase() : "";
		const help = { XA: "Starts a new label format.", XZ: "Ends the current label format.", FO: "Sets the field origin in dots (x,y).", FD: "Provides the data or text for the current field.", FS: "Ends the current field definition.", A0: "Selects a scalable font and its orientation and size.", BC: "Creates a Code 128 barcode.", BQ: "Creates a QR Code barcode.", BY: "Sets barcode module width, ratio, and height.", PW: "Sets the print width in dots.", LL: "Sets the label length in dots.", CF: "Selects the default font and character size.", GB: "Draws a graphic box or line.", FR: "Reverses the field area (white on black).", FX: "Adds a comment; it is not printed." };
		this.root.find(".zs-help-text").text(help[command] ? `^${command} — ${__(help[command])}` : __("Select a command to see a short description."));
	}

	async refresh_saved() {
		const list = this.root.find(".zs-saved-list");
		try {
			const records = await frappe.db.get_list("ZPL Label", { fields: ["name", "title", "modified"], order_by: "modified desc", limit: 50 });
			if (!records.length) { list.html(`<div class="zs-empty-saved">${__("No saved labels yet")}</div>`); return; }
			list.html(records.map((r) => `<button class="zs-saved-item ${r.name === this.name ? "selected" : ""}" data-name="${frappe.utils.escape_html(r.name)}"><span class="zs-saved-icon">▤</span><span class="zs-saved-label">${frappe.utils.escape_html(r.title || r.name)}<small>${frappe.datetime.str_to_user(r.modified)}</small></span><span class="zs-saved-more">›</span></button>`).join(""));
		} catch (_error) { list.html(`<div class="zs-empty-saved">${__("Could not load saved labels")}</div>`); }
	}

	async open(name) {
		try {
			const doc = await frappe.db.get_doc("ZPL Label", name);
			this.name = doc.name; this.$code.val(doc.zpl_code || ""); this.root.find(".zs-title").val(doc.title || doc.name);
			this.root.find(".zs-enabled-for-print").prop("checked", Boolean(doc.enabled_for_print));
			await this.load_programs(doc.registration_program || "");
			this.root.find(".zs-density").val(String(doc.density || "8")); this.root.find(".zs-width").val(doc.label_width || 4); this.root.find(".zs-height").val(doc.label_height || 6); this.root.find(".zs-units").val(doc.units || "inches");
			this.update_gutter(); this.update_size_label(); this.root.find(".zs-save-state").text(__("Saved")).addClass("is-saved"); this.refresh_saved(); this.schedule_render(0);
		} catch (_error) { frappe.msgprint(__("Could not open this label.")); }
	}

	async save() {
		const title = this.root.find(".zs-title").val().trim();
		if (!title) { frappe.msgprint(__("Enter a label name before saving.")); return; }
		const registrationProgram = this.root.find(".zs-registration-program").val();
		if (!registrationProgram) { frappe.msgprint(__("Select a Registration Program before saving.")); return; }
		const s = this.get_settings();
		const doc = { doctype: "ZPL Label", title, registration_program: registrationProgram, enabled_for_print: this.root.find(".zs-enabled-for-print").is(":checked") ? 1 : 0, zpl_code: this.$code.val(), density: `${s.density} dpmm (${({6:152,8:203,12:300,24:600})[s.density]} dpi)`, label_width: Number(s.width), label_height: Number(s.height), units: s.units };
		try {
			if (this.name) { doc.name = this.name; const result = await frappe.call({ method: "frappe.client.save", args: { doc } }); this.name = result.message.name; }
			else { const result = await frappe.call({ method: "frappe.client.insert", args: { doc } }); this.name = result.message.name; }
			this.root.find(".zs-save-state").text(__("Saved")).addClass("is-saved"); this.refresh_saved(); frappe.show_alert({ message: __("Label saved"), indicator: "green" });
		} catch (error) { frappe.msgprint({ title: __("Could not save label"), message: error.message || __("Check that the label name is unique and try again."), indicator: "red" }); }
	}

	new_label() { this.name = null; this.zpl = "^XA\n^PW812\n^LL1218\n^FO50,50^A0N,48,48^FDHello, Zebra!^FS\n^XZ"; this.$code.val(this.zpl); this.root.find(".zs-title").val(__("Untitled label")); this.root.find(".zs-registration-program").val(""); this.root.find(".zs-enabled-for-print").prop("checked", true); this.load_registration_fields(""); this.root.find(".zs-density").val("8"); this.root.find(".zs-width").val("4"); this.root.find(".zs-height").val("6"); this.root.find(".zs-units").val("inches"); this.update_gutter(); this.update_size_label(); this.mark_unsaved(); this.refresh_saved(); this.schedule_render(0); }

	async download(format) {
		if (format === "zpl") { const blob = new Blob([this.$code.val()], { type: "text/plain;charset=utf-8" }); this.trigger_download(blob, `${this.file_name()}.zpl`); return; }
		const s = this.get_settings(); const factor = s.units === "mm" ? 1 / 25.4 : s.units === "cm" ? 1 / 2.54 : 1;
		const width = (Number(s.width) * factor).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""); const height = (Number(s.height) * factor).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
		try { const response = await fetch(`https://api.labelary.com/v1/printers/${s.density}dpmm/labels/${width}x${height}/${Math.max(0, Number(s.index) || 0)}/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: format === "pdf" ? "application/pdf" : format === "epl" ? "application/epl" : "image/png" }, body: this.$code.val() }); if (!response.ok) throw new Error(await response.text()); const ext = format === "pdf" ? "pdf" : format === "epl" ? "epl" : "png"; this.trigger_download(await response.blob(), `${this.file_name()}.${ext}`); } catch (error) { frappe.msgprint({ title: __("Download failed"), message: error.message, indicator: "red" }); }
	}

	file_name() { return (this.root.find(".zs-title").val() || "label").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "label"; }
	trigger_download(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

}

const ZPL_STUDIO_CSS = `
.zpl-studio-page .page-head { margin-bottom: 10px; }
.zpl-studio-page .page-title { display: none; }
.zpl-studio-root { --zs-ink:#172033; --zs-muted:#778196; --zs-border:#e6e9ef; --zs-blue:#3b66e8; --zs-bg:#f7f8fb; min-height:calc(100vh - 150px); color:var(--zs-ink); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.zs-layout { display:grid; grid-template-columns:238px minmax(0,1fr); min-height:calc(100vh - 150px); background:#fff; border:1px solid var(--zs-border); border-radius:12px; overflow:hidden; box-shadow:0 3px 16px rgba(20,34,65,.04); }
.zs-sidebar { position:relative; display:flex; flex-direction:column; gap:18px; padding:22px 14px 14px; background:#fafbfc; border-right:1px solid var(--zs-border); }
.zs-brand { display:flex; align-items:center; gap:11px; padding:0 7px 5px; }.zs-brand strong,.zs-brand small { display:block; }.zs-brand strong { font-size:15px; }.zs-brand small { margin-top:2px; color:var(--zs-muted); font-size:11px; }.zs-mark { display:grid; place-items:center; width:35px; height:35px; border-radius:10px; background:#eaf0ff; color:var(--zs-blue); font-weight:800; font-size:20px; }
.zs-new { width:100%; }.zs-sidebar-heading { display:flex; align-items:center; justify-content:space-between; padding:5px 7px 0; color:#98a0b0; font-size:10px; font-weight:700; letter-spacing:.09em; }.zs-refresh { border:0; background:none; color:#8790a1; font-size:17px; cursor:pointer; }.zs-saved-list { display:flex; flex-direction:column; gap:3px; overflow:auto; max-height:calc(100vh - 340px); margin-top:-14px; }.zs-empty-saved { padding:12px 8px; color:#939bad; font-size:12px; }.zs-saved-item { display:flex; align-items:center; gap:9px; width:100%; padding:9px 8px; border:0; border-radius:7px; background:transparent; text-align:left; cursor:pointer; color:#586276; }.zs-saved-item:hover,.zs-saved-item.selected { background:#edf1fa; color:#233352; }.zs-saved-icon { color:#8290a6; }.zs-saved-label { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.zs-saved-label small { display:block; margin-top:3px; color:#9aa2b0; font-size:10px; }.zs-saved-more { color:#9ba3b2; font-size:19px; }.zs-sidebar-note { display:flex; align-items:center; gap:7px; margin-top:auto; padding:10px 7px 0; color:#98a0ae; font-size:10px; border-top:1px solid var(--zs-border); }.zs-status-dot { width:7px;height:7px;border-radius:50%;background:#5ac48a; }
.zs-main { display:flex; flex-direction:column; min-width:0; background:#fff; }.zs-topbar { display:flex; align-items:center; justify-content:space-between; gap:15px; min-height:82px; padding:14px 22px; border-bottom:1px solid var(--zs-border); }.zs-eyebrow { margin-bottom:3px; color:#9aa2b1; font-size:9px; font-weight:700; letter-spacing:.12em; }.zs-title { width:min(390px,55vw); padding:0; border:0; outline:0; background:transparent; color:#1d2940; font-size:20px; font-weight:650; }.zs-title:focus { box-shadow:none; }.zs-top-actions { display:flex; align-items:center; gap:8px; }.zs-save-state { margin-right:5px; color:#9aa2b1; font-size:11px; white-space:nowrap; }.zs-save-state.is-saved { color:#39a674; }.zs-settings { display:flex; align-items:end; gap:18px; flex-wrap:wrap; padding:13px 22px; border-bottom:1px solid var(--zs-border); background:#fff; }.zs-control label { display:block; margin-bottom:5px; color:#7e8798; font-size:10px; font-weight:600; }.zs-control select,.zs-control input { height:30px; border-color:#e4e8ef; border-radius:6px; font-size:11px; }.zs-control select { min-width:142px; }.zs-size { display:flex; align-items:center; gap:6px; }.zs-size input { width:60px; }.zs-size select { min-width:77px; width:77px; }.zs-size span,.zs-index span { color:#a0a7b4; font-size:11px; }.zs-index { display:flex;align-items:center;gap:7px; }.zs-index input { width:56px; }.zs-redraw-control { margin-left:auto; }
.zs-workspace { display:grid; grid-template-columns:minmax(340px,1fr) minmax(340px,1fr); gap:14px; flex:1; min-height:450px; padding:15px 18px 12px; background:#fbfcfe; }.zs-editor-panel,.zs-preview-panel { display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--zs-border); border-radius:9px; background:#fff; box-shadow:0 1px 4px rgba(26,42,72,.025); }.zs-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:52px; padding:10px 13px; border-bottom:1px solid #edf0f4; }.zs-panel-head strong { display:block; color:#263249; font-size:12px; }.zs-subtle { display:block; margin-top:3px; color:#9aa2b1; font-size:10px; }.zs-line-count { color:#a2a9b5; font:10px ui-monospace,monospace; }.zs-editor { display:flex; flex:1; min-height:350px; overflow:hidden; background:#fff; }.zs-gutter { display:flex; flex-direction:column; flex:0 0 42px; overflow:hidden; padding:13px 9px 12px 0; background:#fafbfd; border-right:1px solid #f0f2f5; color:#b4bbc7; text-align:right; font:12px/20px ui-monospace,SFMono-Regular,Consolas,monospace; }.zs-code { flex:1; width:100%; min-width:0; min-height:350px; resize:none; padding:13px 14px; border:0; outline:0; background:#fff; color:#334258; font:12px/20px ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre; tab-size:2; }.zs-code:focus { box-shadow:none; }.zs-editor-foot { display:flex; justify-content:space-between; gap:8px; padding:7px 12px; color:#a2a9b5; border-top:1px solid #f0f2f5; font-size:9px; }.zs-validation { color:#48a77b; }.zs-command-help { display:flex; align-items:center; gap:9px; min-height:38px; padding:7px 12px; background:#fbfcfe; border-top:1px solid #f0f2f5; font-size:10px; }.zs-command-help strong { color:#67748a; white-space:nowrap; }.zs-help-text { overflow:hidden; color:#929bad; text-overflow:ellipsis; white-space:nowrap; }
.zs-formats { display:flex; gap:2px; padding:3px; background:#f3f5f8; border-radius:6px; }.zs-formats button { padding:5px 8px; border:0; border-radius:4px; background:transparent; color:#8992a2; font-size:9px; font-weight:700; cursor:pointer; }.zs-formats button.active { background:white; color:#40506a; box-shadow:0 1px 3px #dce0e7; }.zs-preview-stage { display:flex; position:relative; flex:1; min-height:350px; align-items:center; justify-content:center; overflow:auto; padding:24px; background-color:#f4f6f9; background-image:linear-gradient(45deg,#ebeff4 25%,transparent 25%),linear-gradient(-45deg,#ebeff4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ebeff4 75%),linear-gradient(-45deg,transparent 75%,#ebeff4 75%); background-position:0 0,0 7px,7px -7px,-7px 0; background-size:14px 14px; }.zs-preview-image { max-width:100%; max-height:calc(100vh - 300px); object-fit:contain; background:white; box-shadow:0 4px 18px rgba(20,33,58,.16); }.zs-preview-pdf { width:100%; height:100%; min-height:410px; border:0; background:#fff; }.zs-preview-text { width:100%; max-height:100%; overflow:auto; padding:16px; background:#fff; color:#42506a; font:11px/1.5 ui-monospace,monospace; }.zs-preview-message { max-width:340px; color:#8e98a9; font-size:12px; text-align:center; }.zs-preview-message.is-error { color:#c54848; }.zs-preview-loading { position:absolute; z-index:2; top:12px; left:50%; display:flex; align-items:center; gap:8px; padding:7px 11px; transform:translateX(-50%); border:1px solid #e5e8ef; border-radius:20px; background:#fff; color:#66728a; box-shadow:0 2px 8px #17203312; font-size:10px; }.zs-preview-loading[hidden] { display:none; }.zs-spinner { width:12px;height:12px;border:2px solid #dce3f3;border-top-color:#4a6ee7;border-radius:50%;animation:zs-spin .7s linear infinite; }@keyframes zs-spin { to { transform:rotate(360deg); } }.zs-preview-foot { display:flex; justify-content:space-between; padding:8px 12px; border-top:1px solid #edf0f4; color:#9aa2b1; font-size:10px; }.zs-preview-foot a { color:#71809b; }.zs-footer { display:flex; gap:20px; padding:0 21px 14px; color:#58677e; font:10px ui-monospace,monospace; }.zs-footer span span { margin-left:4px; color:#a0a7b4; font-family:Inter,sans-serif; font-size:9px; }
.zs-enabled-toggle { display:flex!important; align-items:center; gap:6px; min-height:30px; color:#536178!important; font-size:11px!important; }.zs-enabled-toggle input { height:auto!important; margin:0; }.zs-program-control select { min-width:205px; }.zs-field-reference { padding:10px 22px; border-bottom:1px solid var(--zs-border); background:#fff; }.zs-field-reference strong { display:block; margin-bottom:7px; color:#69768c; font-size:10px; }.zs-field-list { display:flex; flex-wrap:wrap; gap:6px 14px; color:#65728a; font-size:10px; }.zs-field-token code { margin-right:3px; color:#6540bd; }
@media (max-width:1050px) { .zs-layout { grid-template-columns:190px minmax(0,1fr); }.zs-workspace { grid-template-columns:1fr; }.zs-preview-stage { min-height:360px; } }
@media (max-width:680px) { .zs-layout { display:block; }.zs-sidebar { display:none; }.zs-topbar { align-items:flex-start; flex-direction:column; }.zs-top-actions { width:100%; flex-wrap:wrap; }.zs-settings { gap:12px; }.zs-redraw-control { margin-left:0; }.zs-workspace { padding:10px; }.zs-footer { flex-wrap:wrap; gap:10px; }.zs-preview-stage { min-height:300px; } }
`;
