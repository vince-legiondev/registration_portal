import frappe


def execute():
    # "Pending" is no longer a Print Status. Participants left on it
    # were scanned but never confirmed as printed.
    frappe.db.sql(
        """
        UPDATE `tabEvent Participant`
        SET print_status = 'Not Printed'
        WHERE print_status = 'Pending'
        """
    )
