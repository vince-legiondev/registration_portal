// Copyright (c) 2026, Legion Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on("Event Participant", {
	refresh(frm) {
		render_qr_code(frm);
	},
});

function render_qr_code(frm) {
	const wrapper = frm.get_field("qr_code").$wrapper;

	if (!frm.doc.qr_token) {
		wrapper.html(`<div class="text-muted">${__("QR code not generated yet.")}</div>`);
		return;
	}

	frappe.call({
		method: "scan_me.utils.jinja_functions.qr",
		args: {
			data: frm.doc.qr_token,
		},
		callback(r) {
			if (!r.message) {
				return;
			}

			const revoked = frm.doc.qr_status === "Revoked";

			wrapper.html(`
				<div style="text-align: center;">
					<img
						src="${r.message}"
						alt="${__("QR Code")}"
						style="width: 200px; height: 200px;${revoked ? " opacity: 0.3;" : ""}"
					>
					${
						revoked
							? `<div class="text-danger" style="margin-top: 6px;">${__("Revoked")}</div>`
							: ""
					}
				</div>
			`);
		},
	});
}
