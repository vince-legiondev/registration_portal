import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class RegistrationProgram(Document):

    def validate(self):
        self.validate_fee()
        self.validate_registration_dates()

    def validate_fee(self):
        if not self.is_paid:
            self.registration_fee = 0
            return

        if not self.registration_fee or self.registration_fee <= 0:
            frappe.throw(
                "Registration Fee must be greater than zero for a paid program."
            )

    def validate_registration_dates(self):
        if (
            self.registration_start
            and self.registration_end
            and self.registration_end <= self.registration_start
        ):
            frappe.throw(
                "Registration End must be later than Registration Start."
            )