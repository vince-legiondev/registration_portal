const REGISTRATION_BROWSER_PRINT_SDK_PATH = "/assets/registration_portal/js/BrowserPrint.min.js";
let registrationBrowserPrintSdkPromise;

frappe.ui.form.on("Registration", {
	refresh(frm) {
		if (frm.is_new() || !["Paid", "Free"].includes(frm.doc.payment_status)) return;
		frm.add_custom_button(__("Print ID"), () => registration_print_id(frm));
	},
});

async function registration_print_id(frm) {
	let labels;
	try {
		const response = await frappe.call({
			method: "registration_portal.registration_portal.zpl_print.get_enabled_labels",
			args: { registration_name: frm.doc.name },
		});
		labels = response.message || [];
	} catch (error) {
		frappe.msgprint({ title: __("Cannot print ID"), message: registration_print_error(error), indicator: "red" });
		return;
	}

	if (!labels.length) {
		frappe.msgprint(__("There are no enabled ZPL labels for this Registration Program."));
		return;
	}
	if (labels.length === 1) {
		registration_print_zpl(frm, labels[0].name);
		return;
	}
	registration_choose_label(frm, labels);
}

function registration_choose_label(frm, labels) {
	const dialog = new frappe.ui.Dialog({
		title: __("Choose ID Label"),
		fields: [{ fieldtype: "HTML", fieldname: "label_picker" }],
		primary_action_label: __("Continue"),
		primary_action() {
			const labelName = dialog.$wrapper.find(".registration-zpl-label").val();
			if (!labelName) return;
			dialog.hide();
			registration_print_zpl(frm, labelName);
		},
	});
	dialog.fields_dict.label_picker.$wrapper.html(
		`<div class="form-group"><label class="control-label">${__("ZPL Label")}</label><select class="form-control registration-zpl-label">${labels
			.map(
				(label) =>
					`<option value="${frappe.utils.escape_html(label.name)}">${frappe.utils.escape_html(label.title || label.name)}</option>`
			)
			.join("")}</select></div>`
	);
	dialog.show();
}

async function registration_print_zpl(frm, labelName) {
	try {
		const response = await frappe.call({
			method: "registration_portal.registration_portal.zpl_print.get_rendered_zpl",
			args: { registration_name: frm.doc.name, zpl_label: labelName },
		});
		const result = response.message;
		const printers = await registration_get_browser_print_printers();
		if (!printers.length) {
			frappe.msgprint(
				__("Zebra Browser Print found no printers. Check that the client is running and a printer is configured.")
			);
			return;
		}
		registration_choose_browser_printer(result, printers);
	} catch (error) {
		frappe.msgprint({ title: __("Cannot print ID"), message: registration_print_error(error), indicator: "red" });
	}
}

async function registration_get_browser_print_printers() {
	const browserPrint = await registration_load_browser_print_sdk();
	const [devices, defaultDevice] = await Promise.all([
		new Promise((resolve, reject) => browserPrint.getLocalDevices(resolve, reject, "printer")),
		new Promise((resolve, reject) => browserPrint.getDefaultDevice("printer", resolve, reject)).catch(() => null),
	]);

	const printers = [];
	const seen = new Set();
	for (const device of [defaultDevice, ...(devices || [])]) {
		if (!device || !device.uid || seen.has(device.uid)) continue;
		seen.add(device.uid);
		printers.push(device);
	}
	return printers;
}

function registration_load_browser_print_sdk() {
	if (window.BrowserPrint) return Promise.resolve(window.BrowserPrint);
	if (registrationBrowserPrintSdkPromise) return registrationBrowserPrintSdkPromise;

	registrationBrowserPrintSdkPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = REGISTRATION_BROWSER_PRINT_SDK_PATH;
		script.async = true;
		script.onload = () => {
			if (window.BrowserPrint) resolve(window.BrowserPrint);
			else reject(new Error(__("The Zebra Browser Print SDK loaded without its BrowserPrint API.")));
		};
		script.onerror = () => {
			registrationBrowserPrintSdkPromise = null;
			reject(
				new Error(
					__("Zebra Browser Print SDK is missing. Add BrowserPrint.min.js to registration_portal/public/js and reload the app.")
				)
			);
		};
		document.head.appendChild(script);
	});
	return registrationBrowserPrintSdkPromise;
}

function registration_choose_browser_printer(result, printers) {
	const options = printers
		.map((printer, index) => {
			const connection = printer.connection || printer.deviceType || __("Printer");
			const label = `${printer.name || __("Zebra printer")} · ${connection}`;
			return `<option value="${index}">${frappe.utils.escape_html(label)}</option>`;
		})
		.join("");
	const dialog = new frappe.ui.Dialog({
		title: __("Print ID"),
		fields: [
			{ fieldtype: "HTML", fieldname: "printer_picker" },
			{ fieldtype: "HTML", fieldname: "print_note" },
		],
		primary_action_label: __("Print ID"),
		primary_action() {
			const index = Number(dialog.$wrapper.find(".registration-browser-printer").val());
			const printer = printers[index];
			if (!printer) return;

			dialog.get_primary_btn().prop("disabled", true);
			try {
				printer.send(
					result.zpl,
					() => {
						frappe.show_alert({ message: __("ID sent to {0}", [printer.name]), indicator: "green" });
						dialog.hide();
					},
					(error) => {
						dialog.get_primary_btn().prop("disabled", false);
						frappe.msgprint({ title: __("Print failed"), message: registration_print_error(error), indicator: "red" });
					}
				);
			} catch (error) {
				dialog.get_primary_btn().prop("disabled", false);
				frappe.msgprint({ title: __("Print failed"), message: registration_print_error(error), indicator: "red" });
			}
		},
	});
	dialog.fields_dict.printer_picker.$wrapper.html(
		`<div class="form-group"><label class="control-label">${__("Zebra printer")}</label><select class="form-control registration-browser-printer">${options}</select></div>`
	);
	dialog.fields_dict.print_note.$wrapper.html(
		`<div class="text-muted">${__("Sends {0} to the selected printer using Zebra Browser Print.").replace("{0}", frappe.utils.escape_html(result.title))}</div>`
	);
	dialog.show();
}

function registration_print_error(error) {
	if (typeof error === "string") return frappe.utils.escape_html(error);
	const message = error?.message || error?.responseText || error?.statusText;
	if (message) return frappe.utils.escape_html(message);
	try {
		return frappe.utils.escape_html(JSON.stringify(error));
	} catch (_error) {
		return __("An unexpected Browser Print error occurred.");
	}
}
