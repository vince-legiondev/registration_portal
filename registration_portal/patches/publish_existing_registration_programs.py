import frappe


def execute():
    # Programs now appear on /register only once submitted (published).
    # Publish the ones that were already live so they don't disappear.
    frappe.db.sql(
        """
        UPDATE `tabRegistration Program`
        SET docstatus = 1
        WHERE docstatus = 0 AND enabled = 1
        """
    )
