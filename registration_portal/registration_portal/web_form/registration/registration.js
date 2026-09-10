frappe.ready(() => {
    setupRegistrationPage();
});


function setupRegistrationPage() {

    hideFrappeWebsiteLayout();

    initializeRegistrationForm();

}


/* ============================================================
   HIDE STANDARD FRAPPE WEBSITE NAVBAR + FOOTER
   ============================================================ */

function hideFrappeWebsiteLayout() {

    document.body.classList.add(
        "registration-web-form-page"
    );


    const style =
        document.createElement(
            "style"
        );

    style.id =
        "registration-web-form-style";


    style.innerHTML = `

        /* ============================================
           HIDE FRAPPE WEBSITE NAVBAR
           ============================================ */

        body.registration-web-form-page .navbar,
        body.registration-web-form-page .web-navbar,
        body.registration-web-form-page header.navbar {
            display: none !important;
        }


        /* ============================================
           HIDE FRAPPE WEBSITE FOOTER
           ============================================ */

        body.registration-web-form-page .web-footer,
        body.registration-web-form-page footer {
            display: none !important;
        }


        /* ============================================
           REMOVE SPACE LEFT BY NAVBAR / FOOTER
           ============================================ */

        body.registration-web-form-page main {
            margin-top: 0 !important;
            padding-top: 0 !important;
        }


        body.registration-web-form-page
        .page-content-wrapper {
            margin-top: 0 !important;
            padding-top: 0 !important;
        }


        body.registration-web-form-page
        .page_content {
            margin-top: 0 !important;
            padding-top: 0 !important;
        }


        body.registration-web-form-page
        .web-page-content {
            margin-top: 0 !important;
            padding-top: 0 !important;
        }


        /* ============================================
           PAGE BACKGROUND
           ============================================ */

        body.registration-web-form-page {
            background: #ffffff !important;
        }


        /* ============================================
           WEB FORM POSITION
           ============================================ */

        body.registration-web-form-page
        .web-form-wrapper,

        body.registration-web-form-page
        .web-form-container {

            margin-top: 40px !important;
            margin-bottom: 60px !important;

        }

    `;


    /*
     * Prevent duplicate styles
     */
    if (
        !document.getElementById(
            "registration-web-form-style"
        )
    ) {

        document.head.appendChild(
            style
        );

    }


    /*
     * Also hide using JavaScript.
     *
     * This is useful because Frappe can render some
     * website elements after frappe.ready().
     */
    hideWebsiteElements();


    /*
     * Check again shortly after page render.
     */
    setTimeout(
        hideWebsiteElements,
        300
    );

    setTimeout(
        hideWebsiteElements,
        1000
    );

}


function hideWebsiteElements() {

    const selectors = [

        ".navbar",

        ".web-navbar",

        "header.navbar",

        ".web-footer",

        "footer"

    ];


    selectors.forEach(
        selector => {

            document
                .querySelectorAll(
                    selector
                )
                .forEach(
                    element => {

                        element.style.setProperty(
                            "display",
                            "none",
                            "important"
                        );

                    }
                );

        }
    );

}


/* ============================================================
   INITIALIZE REGISTRATION FORM
   ============================================================ */

function initializeRegistrationForm() {

    const program =
        getProgramFromUrl();


    if (!program) {

        redirectToProgramList();

        return;

    }


    waitForWebForm(() => {

        addBackButton();

        loadSelectedProgram(
            program
        );

        setupPaymentRedirect();

    });

}


/* ============================================================
   PAYMENT REDIRECT
   ============================================================ */

function setupPaymentRedirect() {

    const originalHandleSuccess =
        frappe.web_form.handle_success.bind(
            frappe.web_form
        );


    frappe.web_form.handle_success =
        function(data) {


            console.log(
                "Registration save response:",
                data
            );


            if (
                data
                && data.payment_token
            ) {

                window.location.href =
                    "/registration-payment?token="
                    + encodeURIComponent(
                        data.payment_token
                    );

                return;

            }


            console.error(
                "Payment token was not returned.",
                data
            );


            originalHandleSuccess(
                data
            );

        };

}


/* ============================================================
   GET PROGRAM FROM URL
   ============================================================ */

function getProgramFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    return params.get(
        "program"
    );

}


/* ============================================================
   REDIRECT BACK TO PROGRAM LIST
   ============================================================ */

function redirectToProgramList() {

    window.location.replace(
        "/register"
    );

}


/* ============================================================
   WAIT UNTIL FRAPPE WEB FORM IS READY
   ============================================================ */

function waitForWebForm(callback) {

    let attempts = 0;

    const maxAttempts = 30;


    const interval =
        setInterval(
            () => {

                attempts++;


                if (
                    frappe.web_form
                    && frappe.web_form.fields_dict
                    && frappe.web_form.fields_dict.registration_program
                ) {

                    clearInterval(
                        interval
                    );


                    callback();

                    return;

                }


                if (
                    attempts
                    >= maxAttempts
                ) {

                    clearInterval(
                        interval
                    );


                    console.error(
                        "Registration Web Form did not finish loading."
                    );


                    redirectToProgramList();

                }

            },
            200
        );

}


/* ============================================================
   LOAD PROGRAM DETAILS
   ============================================================ */

function loadSelectedProgram(program) {

    frappe.call({

        method:
            "registration_portal.registration_portal.api.get_program_details",


        args: {

            program: program

        },


        callback(r) {

            if (!r.message) {

                redirectToProgramList();

                return;

            }


            const data =
                r.message;


            setRegistrationProgram(
                data
            );


            setAmount(
                data
            );


            setCurrency(
                data
            );


            showProgramSummary(
                data
            );

        },


        error() {

            redirectToProgramList();

        }

    });

}


/* ============================================================
   SET REGISTRATION PROGRAM
   ============================================================ */

function setRegistrationProgram(data) {

    if (
        !frappe.web_form
            .fields_dict
            .registration_program
    ) {

        return;

    }


    frappe.web_form.set_value(
        "registration_program",
        data.name
    );


    frappe.web_form.set_df_property(
        "registration_program",
        "read_only",
        1
    );

}


/* ============================================================
   SET AMOUNT
   ============================================================ */

function setAmount(data) {

    if (
        !frappe.web_form
            .fields_dict
            .amount
    ) {

        return;

    }


    frappe.web_form.set_value(
        "amount",
        data.registration_fee
    );


    frappe.web_form.set_df_property(
        "amount",
        "read_only",
        1
    );

}


/* ============================================================
   SET CURRENCY
   ============================================================ */

function setCurrency(data) {

    if (
        !frappe.web_form
            .fields_dict
            .currency
    ) {

        return;

    }


    frappe.web_form.set_value(
        "currency",
        data.currency
    );


    frappe.web_form.set_df_property(
        "currency",
        "read_only",
        1
    );

}


/* ============================================================
   PROGRAM SUMMARY
   ============================================================ */

function showProgramSummary(data) {

    if (
        document.getElementById(
            "registration-program-summary"
        )
    ) {

        return;

    }


    const fee =
        Number(
            data.registration_fee || 0
        ).toLocaleString(
            "en-PH",
            {

                minimumFractionDigits: 2,

                maximumFractionDigits: 2

            }
        );


    const summary =
        document.createElement(
            "div"
        );


    summary.id =
        "registration-program-summary";


    summary.className =
        "alert alert-light border mb-4";


    summary.innerHTML = `

        <div
            style="
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 6px;
            "
        >

            ${escapeHtml(
                data.program_name
            )}

        </div>


        ${
            data.description
                ? `

                    <div
                        class="text-muted"
                        style="
                            margin-bottom: 12px;
                        "
                    >

                        ${escapeHtml(
                            data.description
                        )}

                    </div>

                `
                : ""
        }


        <div>

            <strong>
                Registration Fee:
            </strong>


            ${escapeHtml(
                data.currency
            )}


            ${fee}

        </div>

    `;


    const wrapper =
        getWebFormWrapper();


    if (wrapper) {

        wrapper.prepend(
            summary
        );

    }

}


/* ============================================================
   BACK BUTTON
   ============================================================ */

function addBackButton() {

    if (
        document.getElementById(
            "back-to-programs"
        )
    ) {

        return;

    }


    const wrapper =
        getWebFormWrapper();


    if (!wrapper) {

        return;

    }


    const button =
        document.createElement(
            "a"
        );


    button.id =
        "back-to-programs";


    button.href =
        "/register";


    button.className =
        "btn btn-default mb-3";


    button.innerText =
        "Back to Registration Programs";


    wrapper.prepend(
        button
    );

}


/* ============================================================
   GET WEB FORM WRAPPER
   ============================================================ */

function getWebFormWrapper() {

    return (

        document.querySelector(
            ".web-form-wrapper"
        )

        || document.querySelector(
            ".web-form"
        )

        || document.querySelector(
            ".web-form-container"
        )

    );

}


/* ============================================================
   ESCAPE HTML
   ============================================================ */

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value == null
            ? ""
            : String(
                value
            );


    return div.innerHTML;

}