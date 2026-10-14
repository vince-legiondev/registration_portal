let eventPrintPrinters = [];

frappe.ready(() => {
	const refreshButton = document.getElementById("refresh-devices");
	const printerSelect = document.getElementById("printer-select");
	const cameraSelect = document.getElementById("camera-select");
	if (!refreshButton || !printerSelect || !cameraSelect) {
		console.error("Registration scanner device controls were not found on the page.");
		return;
	}
	initializeEventPrintPrinters();
	startCamera();
	refreshButton.addEventListener("click", refreshEventPrintDevices);
	printerSelect.addEventListener("change", () => {
		const selected = eventPrintPrinters[Number(printerSelect.value)];
		if (selected) localStorage.setItem("registration_event_print_printer", selected.uid);
	});
	cameraSelect.addEventListener("change", async (event) => {
		const cameraId = event.target.value;
		if (!cameraId) return;
		localStorage.setItem("registration_event_print_camera", cameraId);
		await stopEventPrintCamera();
		startCamera(cameraId);
	});
});

async function refreshEventPrintDevices() {
	const results = await Promise.allSettled([
		initializeEventPrintPrinters(),
		(async () => {
			await stopEventPrintCamera();
			await startCamera();
		})(),
	]);
	const cameraResult = results[1];
	if (cameraResult.status === "rejected") {
		console.error("Camera refresh failed:", cameraResult.reason);
		setMessage(getCameraErrorMessage(cameraResult.reason), "danger");
	}
}

async function stopEventPrintCamera() {
	if (!html5QrCode || !cameraRunning) return;
	try {
		await html5QrCode.stop();
	} finally {
		cameraRunning = false;
	}
}

async function startCamera(requestedCameraId) {
	if (cameraRunning) return;
	setState("Starting Camera...", "#f0ad4e");
	setMessage("Requesting camera access...", "info");
	try {
		if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API is not available in this browser.");
		if (typeof Html5Qrcode === "undefined") throw new Error("QR scanner library failed to load.");
		const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		permissionStream.getTracks().forEach((track) => track.stop());
		const cameras = await Html5Qrcode.getCameras();
		if (!cameras?.length) throw new Error("No camera was detected.");

		const cameraSelect = document.getElementById("camera-select");
		cameraSelect.innerHTML = cameras.map((camera) =>
			`<option value="${escapeHtml(camera.id)}">${escapeHtml(camera.label || "Camera")}</option>`
		).join("");
		const savedCameraId = localStorage.getItem("registration_event_print_camera");
		const preferredCamera = cameras.find((camera) => {
			const label = (camera.label || "").toLowerCase();
			return label.includes("back") || label.includes("rear") || label.includes("environment");
		});
		const selectedCamera = cameras.find((camera) => camera.id === requestedCameraId)
			|| cameras.find((camera) => camera.id === savedCameraId)
			|| preferredCamera
			|| cameras[0];
		cameraSelect.value = selectedCamera.id;
		localStorage.setItem("registration_event_print_camera", selectedCamera.id);

		if (!html5QrCode) html5QrCode = new Html5Qrcode("camera-reader");
		await html5QrCode.start(selectedCamera.id, {
			fps: 10,
			qrbox(viewfinderWidth, viewfinderHeight) {
				const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.65);
				return { width: size, height: size };
			},
		}, onQRCodeScanned, () => {});
		cameraRunning = true;
		setState("Ready to Scan", "#28a745");
		clearMessage();
	} catch (error) {
		console.error("CAMERA START ERROR:", error);
		cameraRunning = false;
		setState("Camera Unavailable", "#dc3545");
		setMessage(getCameraErrorMessage(error), "danger");
		return false;
	}
}

async function initializeEventPrintPrinters() {
	const select = document.getElementById("printer-select");
	select.innerHTML = '<option value="">Searching for printers...</option>';
	try {
		if (!window.BrowserPrint) throw new Error("Zebra Browser Print is unavailable. Check that the Browser Print client is installed and running.");
		const [devices, defaultDevice] = await Promise.all([
			new Promise((resolve, reject) => BrowserPrint.getLocalDevices(resolve, reject, "printer")),
			new Promise((resolve, reject) => BrowserPrint.getDefaultDevice("printer", resolve, reject)).catch(() => null),
		]);
		const seen = new Set();
		eventPrintPrinters = [];
		for (const device of [defaultDevice, ...(devices || [])]) {
			if (!device || !device.uid || seen.has(device.uid)) continue;
			seen.add(device.uid);
			eventPrintPrinters.push(device);
		}
		if (!eventPrintPrinters.length) throw new Error("No printers found. Check the Zebra Browser Print client and printer connection.");
		select.innerHTML = eventPrintPrinters.map((printer, index) => {
			const name = printer.name || "Zebra printer";
			const connection = printer.connection || printer.deviceType || "Printer";
			return `<option value="${index}">${escapeHtml(`${name} · ${connection}`)}</option>`;
		}).join("");
		const savedUid = localStorage.getItem("registration_event_print_printer");
		const savedIndex = eventPrintPrinters.findIndex((printer) => printer.uid === savedUid);
		if (savedIndex >= 0) select.value = String(savedIndex);
		const selected = eventPrintPrinters[Number(select.value)];
		if (selected) localStorage.setItem("registration_event_print_printer", selected.uid);
	} catch (error) {
		select.innerHTML = '<option value="">No printer available</option>';
		setMessage(eventPrintError(error), "danger");
	}
}

// QR payloads can be a Registration name or a desk URL such as
// http://localhost:8000/app/registration/REG-2026-0002.
function processScan(scannedValue) {
	if (scannerBusy) return;
	scannerBusy = true;
	setState("Checking Registration...", "#f0ad4e");
	setMessage("QR detected. Checking the Registration...", "info");
	frappe.call({
		method: "registration_portal.registration_portal.event_printing.scan_registration_for_print",
		args: { registration_id: scannedValue },
		async callback(response) {
			const data = response.message;
			if (data?.status === "invalid_payment") {
				setState("Registration Found · Not Paid", "#dc3545");
				setMessage(data.message, "danger");
				setTimeout(resetForNextScan, 4000);
				return;
			}
			if (!data || data.status !== "success") {
				failScan(data?.message || "Registration was not found.");
				return;
			}
			showParticipant(data);
			const labels = data.labels || [];
			if (!labels.length) {
				failScan("No enabled ID labels are configured for this Registration Program.");
				return;
			}
			setState("Registration Verified", "#28a745");
			const label = labels.length === 1 ? labels[0].name : await chooseEventPrintLabel(labels);
			if (!label) {
				resetForNextScan();
				return;
			}
			printScannedRegistration(data, label);
		},
		error(error) {
			console.error("Registration scan failed:", error);
			failScan(eventPrintError(error));
		},
	});
}

function chooseEventPrintLabel(labels) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const dialog = new frappe.ui.Dialog({
			title: "Choose ID label",
			fields: [{ fieldtype: "HTML", fieldname: "label_picker" }],
			primary_action_label: "Print",
			primary_action() {
				finish(dialog.$wrapper.find(".event-print-label").val());
				dialog.hide();
			},
			secondary_action_label: "Cancel",
			secondary_action() {
				finish(null);
				dialog.hide();
			},
		});
		dialog.fields_dict.label_picker.$wrapper.html(
			`<div class="form-group"><label class="control-label">ID label</label><select class="form-control event-print-label">${labels
				.map((label) => `<option value="${escapeHtml(label.name)}">${escapeHtml(label.title || label.name)}</option>`)
				.join("")}</select></div>`
		);
		dialog.$wrapper.on("hidden.bs.modal", () => finish(null));
		dialog.show();
	});
}

async function printScannedRegistration(data, label) {
	const printer = eventPrintPrinters[Number(document.getElementById("printer-select").value)];
	if (!printer) {
		failScan("Select a printer before scanning. Use Refresh printers if it is not listed.");
		return;
	}
	setState("Sending to Printer...", "#f0ad4e");
	setMessage(`Printing ${data.registration} on ${printer.name || "selected printer"}...`, "info");
	try {
		const response = await frappe.call({
			method: "registration_portal.registration_portal.zpl_print.get_rendered_zpl",
			args: { registration_name: data.registration, zpl_label: label },
		});
		const result = response.message;
		await new Promise((resolve, reject) => printer.send(result.zpl, resolve, reject));
		frappe.call({
			method: "registration_portal.registration_portal.event_printing.mark_event_participant_printed",
			args: { event_participant: data.event_participant },
			callback() {
				setState("Ready to Scan", "#28a745");
				setMessage(`ID sent to ${printer.name || "selected printer"}.`, "success");
				setTimeout(resetForNextScan, 2000);
			},
			error(error) {
				markEventPrintFailed(data.event_participant);
				failScan(eventPrintError(error));
			},
		});
	} catch (error) {
		markEventPrintFailed(data.event_participant);
		console.error("Direct print failed:", error);
		failScan(eventPrintError(error));
	}
}

function markEventPrintFailed(participant) {
	frappe.call({
		method: "registration_portal.registration_portal.event_printing.mark_event_participant_print_failed",
		args: { event_participant: participant },
	});
}

function eventPrintError(error) {
	const message = error?.message || error?.responseText || error?.statusText;
	if (message) {
		const match = String(message).match(/"exception"\s*:\s*"([^"]+)/);
		return match ? match[1].replace(/\\n/g, " ") : String(message).replace(/<[^>]*>/g, " ").slice(0, 300);
	}
	return "The scan or print request failed. Check the server and printer connection.";
}
