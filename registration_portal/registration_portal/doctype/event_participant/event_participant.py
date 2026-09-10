import frappe

from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class EventParticipant(Document):

    def before_insert(self):
        self.validate_registration()
        self.set_registration_details()
        self.generate_qr_token()

    def validate(self):
        self.validate_registration()
        self.set_registration_details()

    # ============================================================
    # VALIDATE REGISTRATION
    # ============================================================

    def validate_registration(self):
        if not self.registration:
            frappe.throw(
                _("Registration is required.")
            )

        if not frappe.db.exists(
            "Registration",
            self.registration
        ):
            frappe.throw(
                _("Registration does not exist.")
            )

        registration = frappe.get_doc(
            "Registration",
            self.registration
        )

        if registration.payment_status != "Paid":
            frappe.throw(
                _(
                    "Event Participant can only be created "
                    "for a paid Registration."
                )
            )

    # ============================================================
    # COPY REGISTRATION DETAILS
    # ============================================================

    def set_registration_details(self):
        if not self.registration:
            return

        registration = frappe.get_doc(
            "Registration",
            self.registration
        )

        self.registration_program = (
            registration.registration_program
        )

        self.attendee_name = (
            registration.full_name
        )

        self.email = (
            registration.email
        )

        self.mobile_number = (
            registration.mobile_number
        )

        self.payment_status = "Paid"

    # ============================================================
    # GENERATE INTERNAL QR TOKEN
    # ============================================================

    def generate_qr_token(self):
        if self.qr_token:
            return

        while True:
            token = frappe.generate_hash(
                length=40
            )

            existing = frappe.db.exists(
                "Event Participant",
                {
                    "qr_token": token
                }
            )

            if not existing:
                break

        self.qr_token = token
        self.qr_status = "Active"
        self.qr_generated_at = now_datetime()

        if not self.print_status:
            self.print_status = "Not Printed"