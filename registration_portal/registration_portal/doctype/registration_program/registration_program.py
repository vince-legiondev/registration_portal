import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class RegistrationProgram(Document):

    def validate(self):
        self.validate_fee()
        self.validate_registration_dates()

    def validate_fee(self):
        if self.registration_fee is None or self.registration_fee < 0:
            frappe.throw("Registration Fee cannot be negative.")

    def validate_registration_dates(self):
        if (
            self.registration_start
            and self.registration_end
            and self.registration_end <= self.registration_start
        ):
            frappe.throw(
                "Registration End must be later than Registration Start."
            )