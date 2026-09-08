frappe.ready(() => {
    initializeRegistrationForm();
});


function initializeRegistrationForm() {
    const program = getProgramFromUrl();

    if (!program) {
        redirectToProgramList();
        return;
    }

    waitForWebForm(() => {
        addBackButton();
        loadSelectedProgram(program);
    });
}


function getProgramFromUrl() {
    const params = new URLSearchParams(
        window.location.search
    );

    return params.get("program");
}


function redirectToProgramList() {
    window.location.replace("/register");
}


function waitForWebForm(callback) {
    let attempts = 0;
    const maxAttempts = 30;

    const interval = setInterval(() => {
        attempts++;

        if (
            frappe.web_form
            && frappe.web_form.fields_dict
            && frappe.web_form.fields_dict.registration_program
        ) {
            clearInterval(interval);
            callback();
            return;
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);

            console.error(
                "Registration Web Form did not finish loading."
            );

            redirectToProgramList();
        }

    }, 200);
}


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

            const data = r.message;

            setRegistrationProgram(data);

            setAmount(data);

            setCurrency(data);

            showProgramSummary(data);
        },

        error() {
            redirectToProgramList();
        }
    });
}


function setRegistrationProgram(data) {
    if (
        !frappe.web_form.fields_dict.registration_program
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


function setAmount(data) {
    if (
        !frappe.web_form.fields_dict.amount
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


function setCurrency(data) {
    if (
        !frappe.web_form.fields_dict.currency
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


function showProgramSummary(data) {
    if (
        document.getElementById(
            "registration-program-summary"
        )
    ) {
        return;
    }

    const fee = Number(
        data.registration_fee || 0
    ).toLocaleString(
        "en-PH",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

    const summary =
        document.createElement("div");

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
                        ${data.description}
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
        wrapper.prepend(summary);
    }
}


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
        document.createElement("a");

    button.id =
        "back-to-programs";

    button.href =
        "/register";

    button.className =
        "btn btn-default mb-3";

    button.innerText =
        "Back to Registration Programs";

    wrapper.prepend(button);
}


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


function escapeHtml(value) {
    const div =
        document.createElement("div");

    div.textContent =
        value == null
            ? ""
            : String(value);

    return div.innerHTML;
}