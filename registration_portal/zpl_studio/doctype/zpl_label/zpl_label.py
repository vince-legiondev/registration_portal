import frappe
from frappe.model.document import Document


class ZPLLabel(Document):
	pass


@frappe.whitelist()
def get_registration_fields(registration_program):
	"""Return printable Registration fields and questions for one program."""
	if not registration_program:
		return []
	if not frappe.has_permission("Registration Program", "read", registration_program):
		frappe.throw(frappe._("Not permitted to read this Registration Program."), frappe.PermissionError)

	program = frappe.get_doc("Registration Program", registration_program)
	field_labels = {"registration_id": frappe._("Registration ID")}
	allowed = {
		"registration_program",
		"first_name",
		"middle_name",
		"last_name",
		"full_name",
		"email",
		"mobile_number",
		"currency",
		"amount",
		"payment_status",
	}
	for df in frappe.get_meta("Registration").fields:
		if df.fieldname in allowed:
			field_labels[df.fieldname] = df.label or df.fieldname

	for question in program.registration_fields:
		if question.fieldname:
			field_labels[question.fieldname] = question.label or question.fieldname

	return [{"fieldname": key, "label": label} for key, label in field_labels.items()]
