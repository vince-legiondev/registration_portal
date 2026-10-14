import re

import frappe
from frappe import _
from frappe.utils import cstr


@frappe.whitelist()
def get_enabled_labels(registration_name):
	registration = get_printable_registration(registration_name)
	if not frappe.db.exists("DocType", "ZPL Label"):
		return []

	return frappe.get_list(
		"ZPL Label",
		filters={
			"registration_program": registration.registration_program,
			"enabled_for_print": 1,
		},
		fields=["name", "title"],
		order_by="title asc",
		limit_page_length=100,
	)


@frappe.whitelist()
def get_rendered_zpl(registration_name, zpl_label):
	registration = get_printable_registration(registration_name)
	label = frappe.get_doc("ZPL Label", zpl_label)
	label.check_permission("read")

	if not label.enabled_for_print:
		frappe.throw(_("This ZPL label is disabled for Print ID."))
	if label.registration_program != registration.registration_program:
		frappe.throw(_("This ZPL label is not configured for this Registration Program."))

	values = {"registration_id": registration.name}
	for fieldname in (
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
	):
		values[fieldname] = registration.get(fieldname)
	for answer in registration.answers:
		if answer.fieldname:
			values[answer.fieldname] = answer.answer

	zpl = label.zpl_code or ""
	available_fields = {
		field["fieldname"] for field in get_registration_fields_for_program(registration.registration_program)
	}
	placeholder_pattern = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")
	missing = {match.group(1) for match in placeholder_pattern.finditer(zpl)} - available_fields
	if missing:
		frappe.throw(
			_("These ZPL placeholders are not available for this Registration Program: {0}").format(
				", ".join(sorted(missing))
			)
		)

	# Every listed field works directly as a placeholder. Replace in one pass so
	# registration values containing placeholder-like text are left as-is.
	zpl = placeholder_pattern.sub(
		lambda match: sanitize_zpl_value(values.get(match.group(1))), zpl
	)

	return {"title": label.title, "zpl": zpl}


def get_registration_fields_for_program(registration_program):
	"""Return the fields available for a label's Registration Program."""
	from registration_portal.zpl_studio.doctype.zpl_label.zpl_label import get_registration_fields

	return get_registration_fields(registration_program)


def get_printable_registration(registration_name):
	if not registration_name or not frappe.db.exists("Registration", registration_name):
		frappe.throw(_("Registration does not exist."))
	registration = frappe.get_doc("Registration", registration_name)
	registration.check_permission("read")
	registration.check_permission("print")
	if registration.payment_status not in ("Paid", "Free"):
		frappe.throw(_("Only paid or free registrations can be printed."))
	return registration


def sanitize_zpl_value(value):
	"""Prevent registration data from being interpreted as ZPL commands."""
	text = cstr(value or "")
	return re.sub(r"[\^~\x00-\x1f\x7f]", " ", text)
