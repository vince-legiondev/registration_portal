from urllib.parse import unquote, urlparse

import frappe

from frappe import _
from frappe.utils import now_datetime


PRINT_FORMAT_NAME = "Event Participant Print Format"


@frappe.whitelist()
def scan_registration_for_print(registration_id):
	"""Validate a scanned Registration ID or /app/registration/<name> URL."""
	if not registration_id:
		frappe.throw(_("Registration ID is required."))

	value = str(registration_id).strip()
	if "://" in value or value.startswith("/"):
		value = urlparse(value).path.rstrip("/").split("/")[-1]
	registration_name = unquote(value)

	participant_name = None
	if not frappe.db.exists("Registration", registration_name):
		participant_name = frappe.db.get_value(
			"Event Participant", {"qr_token": registration_name}, "name"
		)
		if not participant_name:
			return {"status": "not_found", "message": _("Registration was not found.")}
		registration_name = frappe.db.get_value("Event Participant", participant_name, "registration")

	payment_status = frappe.db.get_value("Registration", registration_name, "payment_status")
	if payment_status not in ("Paid", "Free"):
		return {
			"status": "invalid_payment",
			"message": _(
				"Registration {0} was found, but its payment status is {1}. "
				"Only Paid or Free registrations can be printed."
			).format(registration_name, payment_status or _("Not set")),
		}

	from registration_portal.registration_portal.zpl_print import get_printable_registration

	registration = get_printable_registration(registration_name)
	participant_name = participant_name or ensure_event_participant_for_registration(registration.name)
	if not participant_name:
		return {
			"status": "invalid_payment",
			"message": _("This registration has not been paid."),
		}
	if frappe.db.get_value("Event Participant", participant_name, "qr_status") == "Revoked":
		return {"status": "revoked", "message": _("This QR code has been revoked.")}

	frappe.db.sql(
		"""
		UPDATE `tabEvent Participant`
		SET scan_count = IFNULL(scan_count, 0) + 1,
			last_scanned_at = %(now)s,
			last_scanned_by = %(user)s
		WHERE name = %(name)s
		""",
		{"now": now_datetime(), "user": frappe.session.user, "name": participant_name},
	)
	participant = frappe.get_doc("Event Participant", participant_name)
	from registration_portal.registration_portal.zpl_print import get_enabled_labels

	return {
		"status": "success",
		"event_participant": participant.name,
		"registration": registration.name,
		"registration_program": registration.registration_program,
		"attendee_name": registration.full_name,
		"email": registration.email,
		"mobile_number": registration.mobile_number,
		"payment_status": registration.payment_status,
		"print_status": participant.print_status,
		"scan_count": participant.scan_count,
		"labels": get_enabled_labels(registration.name),
	}


# ============================================================
# CREATE EVENT PARTICIPANT AFTER PAYMENT
# ============================================================

def ensure_event_participant_for_registration(
    registration_name
):
    if not registration_name:
        return None

    if not frappe.db.exists(
        "Registration",
        registration_name
    ):
        return None

    existing = frappe.db.get_value(
        "Event Participant",
        {
            "registration": registration_name
        },
        "name"
    )

    if existing:
        return existing

    registration = frappe.get_doc(
        "Registration",
        registration_name
    )

    if registration.payment_status not in ("Paid", "Free"):
        return None

    participant = frappe.new_doc(
        "Event Participant"
    )

    participant.registration = (
        registration.name
    )

    participant.insert(
        ignore_permissions=True
    )

    return participant.name


# ============================================================
# SCAN EVENT PARTICIPANT
#
# QR from Scan Me contains doc.qr_token.
# ============================================================

@frappe.whitelist()
def scan_event_participant(
    qr_token
):
    if not qr_token:
        frappe.throw(
            _("QR Token is required.")
        )

    qr_token = str(
        qr_token
    ).strip()

    participant_name = frappe.db.get_value(
        "Event Participant",
        {
            "qr_token": qr_token
        },
        "name"
    )

    if not participant_name:
        return {
            "status": "not_found",
            "message": "QR code is not recognized."
        }

    participant = frappe.get_doc(
        "Event Participant",
        participant_name
    )

    # ========================================================
    # PAYMENT VALIDATION
    # ========================================================

    if participant.payment_status not in ("Paid", "Free"):
        return {
            "status": "invalid_payment",
            "message": (
                "This registration has not been paid."
            )
        }

    # ========================================================
    # QR VALIDATION
    # ========================================================

    if participant.qr_status == "Revoked":
        return {
            "status": "revoked",
            "message": (
                "This QR code has been revoked."
            )
        }

    # ========================================================
    # COUNT SCAN
    #
    # Scanning is unlimited. Every valid scan is counted.
    # ========================================================

    frappe.db.sql(
        """
        UPDATE `tabEvent Participant`
        SET
            scan_count = IFNULL(scan_count, 0) + 1,
            last_scanned_at = %(now)s,
            last_scanned_by = %(user)s
        WHERE name = %(name)s
        """,
        {
            "now": now_datetime(),
            "user": frappe.session.user,
            "name": participant.name
        }
    )

    scan_count = frappe.db.get_value(
        "Event Participant",
        participant.name,
        "scan_count"
    )

    return {
        "status": "success",
        "event_participant": participant.name,
        "registration": participant.registration,
        "registration_program": (
            participant.registration_program
        ),
        "attendee_name": participant.attendee_name,
        "email": participant.email,
        "mobile_number": participant.mobile_number,
        "payment_status": participant.payment_status,
        "print_status": participant.print_status,
        "scan_count": scan_count,
        "print_format": PRINT_FORMAT_NAME
    }


# ============================================================
# MARK PRINTED
# ============================================================

@frappe.whitelist()
def mark_event_participant_printed(
    event_participant
):
    if not event_participant:
        frappe.throw(
            _("Event Participant is required.")
        )

    if not frappe.db.exists(
        "Event Participant",
        event_participant
    ):
        frappe.throw(
            _("Event Participant does not exist.")
        )

    participant = frappe.get_doc(
        "Event Participant",
        event_participant
    )

    if participant.payment_status not in ("Paid", "Free"):
        frappe.throw(
            _(
                "Participant registration is not paid."
            )
        )

    if participant.qr_status == "Revoked":
        frappe.throw(
            _("QR code has been revoked.")
        )

    frappe.db.set_value(
        "Event Participant",
        participant.name,
        {
            "qr_status": "Used",
            "print_status": "Printed",
            "printed_at": now_datetime(),
            "printed_by": frappe.session.user
        }
    )

    return {
        "status": "success",
        "event_participant": participant.name
    }


# ============================================================
# MARK PRINT FAILED
# ============================================================

@frappe.whitelist()
def mark_event_participant_print_failed(
    event_participant
):
    if not event_participant:
        frappe.throw(
            _("Event Participant is required.")
        )

    if not frappe.db.exists(
        "Event Participant",
        event_participant
    ):
        frappe.throw(
            _("Event Participant does not exist.")
        )

    participant = frappe.get_doc(
        "Event Participant",
        event_participant
    )

    values = {
        "print_status": "Failed"
    }

    if participant.qr_status != "Revoked":
        values["qr_status"] = "Active"

    frappe.db.set_value(
        "Event Participant",
        participant.name,
        values
    )

    return {
        "status": "success"
    }


# ============================================================
# RESET FOR REPRINT
# ============================================================

@frappe.whitelist()
def reset_event_participant_print(
    event_participant
):
    frappe.only_for(
        "System Manager"
    )

    if not frappe.db.exists(
        "Event Participant",
        event_participant
    ):
        frappe.throw(
            _("Event Participant does not exist.")
        )

    frappe.db.set_value(
        "Event Participant",
        event_participant,
        {
            "qr_status": "Active",
            "print_status": "Not Printed",
            "printed_at": None,
            "printed_by": None
        }
    )

    return {
        "status": "success"
    }
