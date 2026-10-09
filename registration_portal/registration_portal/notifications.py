import base64

import frappe

from frappe import _
from frappe.utils import (
    fmt_money,
    format_datetime,
    get_url
)


def safe_send(send, doc):
    # A failed email must never block a registration
    # or a payment webhook.
    try:
        send(doc)
    except Exception:
        frappe.log_error(
            title=f"Registration Email Failed - {doc.name}",
            message=frappe.get_traceback()
        )


# ============================================================
# PAYMENT PENDING
#
# Sent right after a paid registration is created, so the
# registrant can still pay if they leave the checkout flow.
# ============================================================

def send_payment_pending_email(registration):
    if not registration.email:
        return

    payment_url = get_url(
        "/registration-payment?token="
        + registration.payment_token
    )

    frappe.sendmail(
        recipients=[registration.email],
        subject=_(
            "Complete your payment for {0}"
        ).format(
            registration.registration_program
        ),
        template="registration_payment_pending",
        args={
            "first_name": registration.first_name,
            "program_name": registration.registration_program,
            "registration_id": registration.name,
            "amount": fmt_money(
                registration.amount,
                currency=registration.currency
            ),
            "payment_url": payment_url
        },
        reference_doctype="Registration",
        reference_name=registration.name
    )


# ============================================================
# REGISTRATION CONFIRMED
#
# Sent once the Event Participant (and its QR token) exists,
# for both paid and free registrations.
# ============================================================

def send_registration_confirmed_email(participant):
    registration = frappe.get_doc(
        "Registration",
        participant.registration
    )

    if not registration.email:
        return

    qr_file = save_qr_code_file(participant)

    if registration.payment_status == "Free":
        payment = _("Free")
        payment_reference = None
    else:
        payment = fmt_money(
            registration.amount,
            currency=registration.currency
        )
        payment_reference = registration.payment_transaction

    frappe.sendmail(
        recipients=[registration.email],
        subject=_(
            "Registration confirmed: {0}"
        ).format(
            registration.registration_program
        ),
        template="registration_confirmed",
        args={
            "first_name": registration.first_name,
            "full_name": registration.full_name,
            "program_name": registration.registration_program,
            "registration_id": registration.name,
            "email": registration.email,
            "mobile_number": registration.mobile_number,
            "payment_status": registration.payment_status,
            "payment": payment,
            "payment_reference": payment_reference,
            "registered_on": format_datetime(
                registration.creation,
                "MMMM d, yyyy h:mm a"
            ),
            "answers": [
                row
                for row in registration.answers
                if row.show_in_email
            ],
            "qr_token": participant.qr_token,
            "qr_embed": qr_file.file_url.lstrip("/")
        },
        attachments=[{
            "fid": qr_file.name
        }],
        reference_doctype="Event Participant",
        reference_name=participant.name
    )


def save_qr_code_file(participant):
    # Same QR generator the print format uses, so the emailed
    # code scans exactly like the printed pass.
    from scan_me.utils.jinja_functions import qr

    data_uri = qr(participant.qr_token)

    content = base64.b64decode(
        data_uri.split(",", 1)[1]
    )

    return frappe.get_doc({
        "doctype": "File",
        "file_name": f"QR-{participant.name}.png",
        "attached_to_doctype": "Event Participant",
        "attached_to_name": participant.name,
        "is_private": 1,
        "content": content
    }).insert(
        ignore_permissions=True
    )
