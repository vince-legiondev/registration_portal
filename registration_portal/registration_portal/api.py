import hmac

import frappe
import requests

from frappe import _
from frappe.utils import (
    flt,
    get_datetime,
    now_datetime
)
from frappe.utils.password import get_decrypted_password


XENDIT_SESSION_URL = "https://api.xendit.co/sessions"


# ============================================================
# XENDIT SETTINGS
# ============================================================

def get_xendit_settings():
    settings = frappe.get_single(
        "Xendit Settings"
    )

    if not settings.enabled:
        frappe.throw(
            _("Xendit payment is currently disabled.")
        )

    api_key = get_decrypted_password(
        "Xendit Settings",
        "Xendit Settings",
        "secret_api_key"
    )

    if not api_key:
        frappe.throw(
            _("Xendit Secret API Key is not configured.")
        )

    if api_key.startswith("xnd_publ"):
        frappe.throw(
            _(
                "The configured Xendit API key is a Public API Key. "
                "Please configure a Secret API Key."
            )
        )

    return settings, api_key


def get_xendit_webhook_token():
    webhook_token = get_decrypted_password(
        "Xendit Settings",
        "Xendit Settings",
        "webhook_verification_token"
    )

    if not webhook_token:
        frappe.throw(
            _(
                "Xendit Webhook Verification Token "
                "is not configured."
            )
        )

    return webhook_token


# ============================================================
# REGISTRATION PROGRAMS
# ============================================================

@frappe.whitelist(allow_guest=True)
def get_registration_programs():
    current_time = now_datetime()

    programs = frappe.get_all(
        "Registration Program",
        filters={
            "enabled": 1
        },
        fields=[
            "name",
            "program_name",
            "description",
            "registration_fee",
            "currency",
            "registration_start",
            "registration_end",
            "maximum_registrants"
        ],
        order_by="creation desc"
    )

    available_programs = []

    for program in programs:

        if (
            program.registration_start
            and current_time < program.registration_start
        ):
            continue

        if (
            program.registration_end
            and current_time > program.registration_end
        ):
            continue

        if program.maximum_registrants:
            registration_count = frappe.db.count(
                "Registration",
                {
                    "registration_program": program.name,
                    "docstatus": ["<", 2]
                }
            )

            if (
                registration_count
                >= program.maximum_registrants
            ):
                continue

        available_programs.append({
            "name": program.name,
            "program_name": program.program_name,
            "description": program.description,
            "registration_fee": program.registration_fee,
            "currency": program.currency,
            "registration_start": program.registration_start,
            "registration_end": program.registration_end,
            "maximum_registrants": program.maximum_registrants
        })

    return available_programs


@frappe.whitelist(allow_guest=True)
def get_program_details(program):
    if not program:
        frappe.throw(
            _("Registration Program is required.")
        )

    data = frappe.db.get_value(
        "Registration Program",
        program,
        [
            "name",
            "program_name",
            "description",
            "registration_fee",
            "currency",
            "registration_start",
            "registration_end",
            "maximum_registrants",
            "enabled"
        ],
        as_dict=True
    )

    if not data:
        frappe.throw(
            _("Registration Program does not exist.")
        )

    if not data.enabled:
        frappe.throw(
            _("This Registration Program is unavailable.")
        )

    current_time = now_datetime()

    if (
        data.registration_start
        and current_time < data.registration_start
    ):
        frappe.throw(
            _("Registration for this program has not started yet.")
        )

    if (
        data.registration_end
        and current_time > data.registration_end
    ):
        frappe.throw(
            _("Registration for this program has already ended.")
        )

    if data.maximum_registrants:
        registration_count = frappe.db.count(
            "Registration",
            {
                "registration_program": data.name,
                "docstatus": ["<", 2]
            }
        )

        if (
            registration_count
            >= data.maximum_registrants
        ):
            frappe.throw(
                _("This Registration Program is already full.")
            )

    return {
        "name": data.name,
        "program_name": data.program_name,
        "description": data.description,
        "registration_fee": data.registration_fee,
        "currency": data.currency,
        "registration_start": data.registration_start,
        "registration_end": data.registration_end,
        "maximum_registrants": data.maximum_registrants
    }


# ============================================================
# TEST XENDIT CONNECTION
# ============================================================

@frappe.whitelist()
def test_xendit_connection():
    frappe.only_for(
        "System Manager"
    )

    settings, api_key = get_xendit_settings()

    payload = {
        "reference_id": (
            f"TEST-{frappe.generate_hash(length=12)}"
        ),
        "session_type": "PAY",
        "mode": "PAYMENT_LINK",
        "currency": "PHP",
        "amount": 100,
        "country": "PH",
        "locale": "en",
        "capture_method": "AUTOMATIC",
        "description": "Xendit Connection Test"
    }

    try:
        response = requests.post(
            XENDIT_SESSION_URL,
            json=payload,
            auth=(api_key, ""),
            timeout=30
        )

        return {
            "status_code": response.status_code,
            "response": response.text,
            "api_key_loaded": bool(api_key),
            "api_key_prefix": (
                api_key[:8]
                if api_key
                else None
            ),
            "api_key_length": (
                len(api_key)
                if api_key
                else 0
            )
        }

    except requests.RequestException as e:
        return {
            "status": "error",
            "message": str(e)
        }


# ============================================================
# ADMIN / MANUAL PAYMENT SESSION
# ============================================================

@frappe.whitelist()
def create_payment_session(
    payment_transaction
):
    frappe.only_for(
        "System Manager"
    )

    if not payment_transaction:
        frappe.throw(
            _("Payment Transaction is required.")
        )

    if not frappe.db.exists(
        "Payment Transaction",
        payment_transaction
    ):
        frappe.throw(
            _("Payment Transaction does not exist.")
        )

    payment = frappe.get_doc(
        "Payment Transaction",
        payment_transaction
    )

    return _create_payment_session(
        payment=payment
    )


# ============================================================
# PUBLIC PAYMENT START
# ============================================================

@frappe.whitelist(
    allow_guest=True
)
def start_registration_payment(
    payment_token
):
    registration = get_registration_by_token(
        payment_token
    )

    if (
        registration.payment_status
        == "Paid"
    ):
        return {
            "status": "paid",
            "registration": registration.name
        }

    if not registration.payment_transaction:
        frappe.throw(
            _("Payment Transaction was not created.")
        )

    payment = frappe.get_doc(
        "Payment Transaction",
        registration.payment_transaction
    )

    return _create_payment_session(
        payment=payment,
        registration=registration
    )


# ============================================================
# INTERNAL XENDIT SESSION CREATION
# ============================================================

def _create_payment_session(
    payment,
    registration=None
):
    if payment.status == "Paid":
        frappe.throw(
            _("This payment has already been completed.")
        )

    # --------------------------------------------------------
    # REUSE CURRENT ACTIVE SESSION
    # --------------------------------------------------------

    if (
        payment.payment_url
        and payment.xendit_session_id
        and payment.xendit_session_expires_at
    ):
        expires_at = get_datetime(
            payment.xendit_session_expires_at
        )

        if expires_at > now_datetime():
            return {
                "payment_transaction": payment.name,
                "xendit_session_id": (
                    payment.xendit_session_id
                ),
                "payment_url": (
                    payment.payment_url
                ),
                "reused": True
            }

    settings, api_key = (
        get_xendit_settings()
    )

    if (
        not registration
        and payment.reference_doctype
        == "Registration"
        and payment.reference_name
    ):
        registration = frappe.get_doc(
            "Registration",
            payment.reference_name
        )

    # --------------------------------------------------------
    # XENDIT PAYMENT SESSION
    # --------------------------------------------------------

    payload = {
        "reference_id": payment.name,
        "session_type": "PAY",
        "mode": "PAYMENT_LINK",
        "currency": payment.currency,
        "amount": float(
            payment.amount
        ),
        "country": "PH",
        "locale": "en",
        "capture_method": "AUTOMATIC",
        "description": (
            f"Registration Payment - "
            f"{payment.reference_name}"
        ),
        "metadata": {
            "payment_transaction": (
                payment.name
            ),
            "reference_doctype": (
                payment.reference_doctype
            ),
            "reference_name": (
                payment.reference_name
            )
        }
    }

    # --------------------------------------------------------
    # CUSTOMER
    #
    # IMPORTANT:
    # Xendit requires customer.reference_id to be unique.
    # Do not reuse REG-2026-XXXX for every session.
    # --------------------------------------------------------

    if registration:

        customer_reference_id = (
            f"{registration.name}-"
            f"{frappe.generate_hash(length=10)}"
        )

        customer = {
            "reference_id": (
                customer_reference_id
            ),
            "type": "INDIVIDUAL"
        }

        if getattr(
            registration,
            "email",
            None
        ):
            customer[
                "email"
            ] = registration.email

        individual_detail = {}

        if getattr(
            registration,
            "first_name",
            None
        ):
            individual_detail[
                "given_names"
            ] = registration.first_name

        elif getattr(
            registration,
            "full_name",
            None
        ):
            individual_detail[
                "given_names"
            ] = registration.full_name

        if getattr(
            registration,
            "last_name",
            None
        ):
            individual_detail[
                "surname"
            ] = registration.last_name

        if individual_detail:
            customer[
                "individual_detail"
            ] = individual_detail

        payload[
            "customer"
        ] = customer

    # --------------------------------------------------------
    # RETURN URLS
    # --------------------------------------------------------

    if settings.success_url:
        payload[
            "success_return_url"
        ] = build_return_url(
            settings.success_url,
            registration
        )

    if settings.cancel_url:
        payload[
            "cancel_return_url"
        ] = build_return_url(
            settings.cancel_url,
            registration
        )

    # --------------------------------------------------------
    # CALL XENDIT
    # --------------------------------------------------------

    try:
        response = requests.post(
            XENDIT_SESSION_URL,
            json=payload,
            auth=(api_key, ""),
            timeout=30
        )

    except requests.RequestException as e:
        frappe.log_error(
            title="Xendit Request Error",
            message=frappe.get_traceback()
        )

        frappe.throw(
            _(
                "Unable to connect to Xendit: {0}"
            ).format(
                str(e)
            )
        )

    if not response.ok:
        frappe.log_error(
            title=(
                "Xendit Payment Session Error"
            ),
            message=(
                f"Status Code: "
                f"{response.status_code}\n\n"
                f"Response:\n"
                f"{response.text}"
            )
        )

        frappe.throw(
            _(
                "Unable to create "
                "Xendit payment session."
            )
        )

    data = response.json()

    payment_url = data.get(
        "payment_link_url"
    )

    session_id = data.get(
        "payment_session_id"
    )

    expires_at = data.get(
        "expires_at"
    )

    if not payment_url:
        frappe.log_error(
            title=(
                "Invalid Xendit "
                "Payment Session Response"
            ),
            message=frappe.as_json(
                data
            )
        )

        frappe.throw(
            _(
                "Xendit did not return "
                "a payment URL."
            )
        )

    values = {
        "external_reference_id": (
            payment.name
        ),
        "xendit_session_id": (
            session_id
        ),
        "payment_url": (
            payment_url
        )
    }

    if expires_at:
        expires_at = get_datetime(
            expires_at
        )

        values[
            "xendit_session_expires_at"
        ] = expires_at.strftime(
            "%Y-%m-%d %H:%M:%S"
        )

    frappe.db.set_value(
        "Payment Transaction",
        payment.name,
        values
    )

    return {
        "payment_transaction": (
            payment.name
        ),
        "xendit_session_id": (
            session_id
        ),
        "payment_url": (
            payment_url
        ),
        "reused": False
    }


# ============================================================
# RETURN URL HELPER
# ============================================================

def build_return_url(
    base_url,
    registration
):
    if not registration:
        return base_url

    if not registration.payment_token:
        return base_url

    separator = (
        "&"
        if "?" in base_url
        else "?"
    )

    return (
        f"{base_url}"
        f"{separator}"
        f"token="
        f"{registration.payment_token}"
    )


# ============================================================
# PAYMENT STATUS
# ============================================================

@frappe.whitelist(
    allow_guest=True
)
def get_registration_payment_status(
    payment_token
):
    registration = (
        get_registration_by_token(
            payment_token
        )
    )

    payment = None

    if registration.payment_transaction:
        payment = frappe.get_doc(
            "Payment Transaction",
            registration.payment_transaction
        )

    program_name = None

    if registration.registration_program:
        program_name = (
            frappe.db.get_value(
                "Registration Program",
                registration.registration_program,
                "program_name"
            )
        )

    return {
        "registration": (
            registration.name
        ),
        "program": (
            program_name
        ),
        "amount": (
            registration.amount
        ),
        "currency": (
            registration.currency
        ),
        "payment_status": (
            registration.payment_status
        ),
        "payment_transaction": (
            registration.payment_transaction
        ),
        "transaction_status": (
            payment.status
            if payment
            else None
        ),
        "docstatus": (
            registration.docstatus
        )
    }


# ============================================================
# PAYMENT TOKEN LOOKUP
# ============================================================

def get_registration_by_token(
    payment_token
):
    if not payment_token:
        frappe.throw(
            _("Payment token is required.")
        )

    registration_name = (
        frappe.db.get_value(
            "Registration",
            {
                "payment_token": (
                    payment_token
                )
            },
            "name"
        )
    )

    if not registration_name:
        frappe.throw(
            _(
                "Registration "
                "could not be found."
            )
        )

    return frappe.get_doc(
        "Registration",
        registration_name
    )


# ============================================================
# REAL XENDIT WEBHOOK
# ============================================================

@frappe.whitelist(
    allow_guest=True,
    methods=["POST"]
)
def xendit_webhook():

    expected_token = (
        get_xendit_webhook_token()
    )

    received_token = (
        frappe.get_request_header(
            "x-callback-token"
        )
    )

    if not received_token:
        frappe.local.response[
            "http_status_code"
        ] = 401

        return {
            "status": "error",
            "message": (
                "Missing Xendit callback token."
            )
        }

    if not hmac.compare_digest(
        str(received_token),
        str(expected_token)
    ):
        frappe.local.response[
            "http_status_code"
        ] = 401

        return {
            "status": "error",
            "message": (
                "Invalid Xendit callback token."
            )
        }

    payload = frappe.request.get_json(
        silent=True
    )

    if not payload:
        frappe.local.response[
            "http_status_code"
        ] = 400

        return {
            "status": "error",
            "message": (
                "Webhook payload is empty."
            )
        }

    frappe.log_error(
        title=(
            f"Xendit Webhook - "
            f"{payload.get('event')}"
        ),
        message=frappe.as_json(
            payload
        )
    )

    return process_xendit_event(
        payload
    )


# ============================================================
# WEBHOOK PROCESSOR
# ============================================================

def process_xendit_event(
    payload
):
    event = payload.get(
        "event"
    )

    data = payload.get(
        "data"
    ) or {}

    reference_id = data.get(
        "reference_id"
    )

    payment_name = None

    metadata = data.get(
        "metadata"
    ) or {}

    if metadata.get(
        "payment_transaction"
    ):
        payment_name = (
            metadata.get(
                "payment_transaction"
            )
        )

    if (
        not payment_name
        and reference_id
    ):
        payment_name = (
            frappe.db.get_value(
                "Payment Transaction",
                {
                    "external_reference_id":
                        reference_id
                },
                "name"
            )
        )

    if (
        not payment_name
        and reference_id
        and frappe.db.exists(
            "Payment Transaction",
            reference_id
        )
    ):
        payment_name = (
            reference_id
        )

    if not payment_name:
        frappe.log_error(
            title=(
                "Xendit Payment Transaction "
                "Not Found"
            ),
            message=frappe.as_json(
                payload
            )
        )

        return {
            "status": "not_found"
        }

    payment = frappe.get_doc(
        "Payment Transaction",
        payment_name
    )

    if (
        event
        == "payment_session.completed"
    ):
        handle_completed_payment(
            payment,
            data
        )

    elif (
        event
        == "payment_session.expired"
    ):
        handle_expired_payment(
            payment,
            data
        )

    else:
        return {
            "status": "ignored",
            "event": event
        }

    return {
        "status": "success",
        "event": event,
        "payment_transaction": (
            payment.name
        )
    }


# ============================================================
# PAYMENT COMPLETED
# ============================================================

def handle_completed_payment(
    payment,
    data
):
    if payment.status == "Paid":
        return

    callback_amount = (
        data.get(
            "amount"
        )
    )

    callback_currency = (
        data.get(
            "currency"
        )
    )

    if callback_amount is None:
        frappe.throw(
            _(
                "Xendit callback "
                "amount is missing."
            )
        )

    if (
        flt(callback_amount)
        != flt(payment.amount)
    ):
        frappe.throw(
            _(
                "Xendit payment amount "
                "does not match."
            )
        )

    if (
        callback_currency
        != payment.currency
    ):
        frappe.throw(
            _(
                "Xendit payment currency "
                "does not match."
            )
        )

    session_id = (
        data.get(
            "payment_session_id"
        )
    )

    payment_id = (
        data.get(
            "payment_id"
        )
    )

    values = {
        "status": "Paid",
        "paid_at": now_datetime()
    }

    if session_id:
        values[
            "xendit_session_id"
        ] = session_id

    if payment_id:
        values[
            "xendit_payment_id"
        ] = payment_id

    frappe.db.set_value(
        "Payment Transaction",
        payment.name,
        values
    )

    update_registration_after_payment(
        payment
    )


# ============================================================
# SESSION EXPIRED
# ============================================================

def handle_expired_payment(
    payment,
    data
):
    if payment.status == "Paid":
        return

    frappe.db.set_value(
        "Payment Transaction",
        payment.name,
        "status",
        "Expired"
    )

    if (
        payment.reference_doctype
        == "Registration"
        and payment.reference_name
        and frappe.db.exists(
            "Registration",
            payment.reference_name
        )
    ):
        registration = frappe.get_doc(
            "Registration",
            payment.reference_name
        )

        if registration.docstatus == 0:
            registration.db_set(
                "payment_status",
                "Expired"
            )


# ============================================================
# UPDATE REGISTRATION
# ============================================================

def update_registration_after_payment(
    payment
):
    if (
        payment.reference_doctype
        != "Registration"
    ):
        return

    if not payment.reference_name:
        return

    if not frappe.db.exists(
        "Registration",
        payment.reference_name
    ):
        frappe.throw(
            _(
                "Registration {0} "
                "could not be found."
            ).format(
                payment.reference_name
            )
        )

    registration = frappe.get_doc(
        "Registration",
        payment.reference_name
    )

    registration.db_set(
        "payment_status",
        "Paid",
        update_modified=True
    )

    registration.reload()

    if registration.docstatus == 0:
        registration.flags.ignore_permissions = True

        registration.submit()