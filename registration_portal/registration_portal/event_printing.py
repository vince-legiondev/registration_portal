import frappe

from frappe import _
from frappe.utils import now_datetime


PRINT_FORMAT_NAME = "Event Participant Print Format"


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

    if registration.payment_status != "Paid":
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

    if participant.payment_status != "Paid":
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
    # ALREADY PRINTED
    # ========================================================

    if participant.print_status == "Printed":
        return {
            "status": "already_printed",
            "message": (
                "This participant pass "
                "has already been printed."
            ),
            "event_participant": participant.name,
            "registration": participant.registration,
            "registration_program": (
                participant.registration_program
            ),
            "attendee_name": (
                participant.attendee_name
            ),
            "printed_at": participant.printed_at,
            "printed_by": participant.printed_by
        }

    # ========================================================
    # MARK PRINT AS PENDING
    # ========================================================

    frappe.db.set_value(
        "Event Participant",
        participant.name,
        {
            "print_status": "Pending"
        }
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

    if participant.payment_status != "Paid":
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