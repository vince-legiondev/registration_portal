import frappe
from frappe import _
from frappe.utils import today
from frappe.utils import validate_email_address


@frappe.whitelist(allow_guest=True)
def submit_golf_membership(
    title=None,
    family_name=None,
    given_name=None,
    middle_name=None,
    date_of_birth=None,
    email_address=None,
    whs_id=None,
    address=None,
    phone=None,
    mobile_no=None,
    company=None,
    industry=None,
    other_golf_club_membership=None,
    endorsed_by=None
):
    """
    Creates a Golf Member document from the
    public membership application page.
    """

    validate_membership_application(
        title=title,
        family_name=family_name,
        given_name=given_name,
        date_of_birth=date_of_birth,
        email_address=email_address,
        address=address
    )


    email_address = clean_value(
        email_address
    ).lower()


    if not validate_email_address(
        email_address
    ):
        frappe.throw(
            _(
                "Please enter a valid email address."
            )
        )


    golf_member = frappe.get_doc({

        "doctype":
            "Golf Member",

        "title":
            clean_value(
                title
            ),

        "family_name":
            clean_value(
                family_name
            ),

        "given_name":
            clean_value(
                given_name
            ),

        "middle_name":
            clean_value(
                middle_name
            ),

        "date_of_birth":
            date_of_birth,

        "email_address":
            email_address,

        "whs_id":
            clean_value(
                whs_id
            ),

        "address":
            clean_value(
                address
            ),

        "phone":
            clean_value(
                phone
            ),

        "mobile_no":
            clean_value(
                mobile_no
            ),

        "company":
            clean_value(
                company
            ),

        "industry":
            clean_value(
                industry
            ),

        "other_golf_club_membership":
            clean_value(
                other_golf_club_membership
            ),

        "endorsed_by":
            clean_value(
                endorsed_by
            ),

        "application_date":
            today()

    })


    golf_member.insert(
        ignore_permissions=True
    )


    return {

        "success":
            True,

        "name":
            golf_member.name,

        "message":
            "Your membership application has been submitted successfully."

    }



def validate_membership_application(
    title=None,
    family_name=None,
    given_name=None,
    date_of_birth=None,
    email_address=None,
    address=None
):

    required_fields = {

        "Title":
            title,

        "Family Name":
            family_name,

        "Given Name":
            given_name,

        "Date of Birth":
            date_of_birth,

        "Email Address":
            email_address,

        "Address":
            address

    }


    missing_fields = []


    for label, value in required_fields.items():

        if not clean_value(value):

            missing_fields.append(
                label
            )


    if missing_fields:

        frappe.throw(
            _(
                "Please complete the following required fields: {0}"
            ).format(
                ", ".join(
                    missing_fields
                )
            )
        )



def clean_value(value):

    if value is None:
        return ""

    return str(value).strip()