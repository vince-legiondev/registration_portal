import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class RegistrationProgram(Document):

    def validate(self):
        self.validate_fee()
        self.validate_registration_dates()
        self.validate_registration_fields()

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

    def validate_registration_fields(self):
        seen = set()

        for row in self.registration_fields:
            row.label = (row.label or "").strip()

            if not row.fieldname:
                row.fieldname = frappe.scrub(row.label)[:60] or f"question_{row.idx}"

            fieldname = row.fieldname
            suffix = 2

            while fieldname in seen:
                fieldname = f"{row.fieldname}_{suffix}"
                suffix += 1

            row.fieldname = fieldname
            seen.add(fieldname)

            if row.fieldtype == "Select":
                options = [
                    option.strip()
                    for option in (row.options or "").split("\n")
                    if option.strip()
                ]

                if not options:
                    frappe.throw(
                        "Row {0}: add at least one option for \"{1}\".".format(
                            row.idx,
                            row.label
                        )
                    )

                row.options = "\n".join(options)
