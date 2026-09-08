import frappe

from frappe.model.document import Document
from frappe.utils import now_datetime


class Registration(Document):

    def before_insert(self):
        self.validate_registration_program()
        self.set_registration_details()
        self.set_full_name()
        self.set_payment_token()

    def validate(self):
        self.validate_registration_program()
        self.set_registration_details()
        self.set_full_name()

    def after_insert(self):
        self.create_payment_transaction()

        frappe.session.data[
            "registration_payment_token"
        ] = self.payment_token

    def before_submit(self):
        if not self.payment_transaction:
            frappe.throw(
                "Payment Transaction is required before submitting."
            )

    def validate_registration_program(self):
        if not self.registration_program:
            frappe.throw(
                "Please select a Registration Program."
            )

        program = frappe.get_doc(
            "Registration Program",
            self.registration_program
        )

        if not program.enabled:
            frappe.throw(
                "Registration for this program is currently unavailable."
            )

        current_time = now_datetime()

        if (
            program.registration_start
            and current_time < program.registration_start
        ):
            frappe.throw(
                "Registration for this program has not started yet."
            )

        if (
            program.registration_end
            and current_time > program.registration_end
        ):
            frappe.throw(
                "Registration for this program has already ended."
            )

        if program.maximum_registrants:
            registration_count = frappe.db.count(
                "Registration",
                {
                    "registration_program": self.registration_program
                }
            )

            if (
                registration_count
                >= program.maximum_registrants
                and self.is_new()
            ):
                frappe.throw(
                    "This Registration Program is already full."
                )

    def set_registration_details(self):
        program = frappe.get_doc(
            "Registration Program",
            self.registration_program
        )

        self.amount = program.registration_fee
        self.currency = program.currency

        if not self.payment_status:
            self.payment_status = "Pending Payment"

    def set_full_name(self):
        parts = [
            self.first_name,
            self.middle_name,
            self.last_name
        ]

        self.full_name = " ".join(
            part.strip()
            for part in parts
            if part and part.strip()
        )

    def set_payment_token(self):
        if self.payment_token:
            return

        while True:
            token = frappe.generate_hash(
                length=40
            )

            existing = frappe.db.exists(
                "Registration",
                {
                    "payment_token": token
                }
            )

            if not existing:
                self.payment_token = token
                break

    def create_payment_transaction(self):
        if self.payment_transaction:
            return

        payment = frappe.new_doc(
            "Payment Transaction"
        )

        payment.reference_doctype = "Registration"
        payment.reference_name = self.name
        payment.amount = self.amount
        payment.currency = self.currency
        payment.gateway = "Xendit"
        payment.status = "Pending"

        payment.insert(
            ignore_permissions=True
        )

        self.db_set(
            "payment_transaction",
            payment.name,
            update_modified=False
        )