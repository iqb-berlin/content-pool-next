<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName'); section>
    <#if section = "header">
        Registrierung
    <#elseif section = "form">
        <form id="kc-register-form" class="iqb-form iqb-register-form" action="${url.registrationAction}" method="post">
            <div class="form-group">
                <label for="firstName" class="pf-c-form__label pf-c-form__label-text">${msg("firstName")}</label>
                <input type="text" id="firstName" class="pf-c-form-control" name="firstName" value="${(register.formData.firstName!'')}" />
            </div>

            <div class="form-group">
                <label for="lastName" class="pf-c-form__label pf-c-form__label-text">${msg("lastName")}</label>
                <input type="text" id="lastName" class="pf-c-form-control" name="lastName" value="${(register.formData.lastName!'')}" />
            </div>

            <div class="form-group">
                <label for="email" class="pf-c-form__label pf-c-form__label-text">${msg("email")}</label>
                <input type="text" id="email" class="pf-c-form-control" name="email" value="${(register.formData.email!'')}" autocomplete="email" />
            </div>

            <div class="form-group">
                <label for="username" class="pf-c-form__label pf-c-form__label-text">${msg("username")}</label>
                <input type="text" id="username" class="pf-c-form-control" name="username" value="${(register.formData.username!'')}" autocomplete="username" />
            </div>

            <#if passwordRequired??>
                <div class="form-group">
                    <label for="password" class="pf-c-form__label pf-c-form__label-text">${msg("password")}</label>
                    <div class="pf-c-input-group">
                        <input type="password" id="password" class="pf-c-form-control" name="password" autocomplete="new-password" />
                        <button class="pf-c-button pf-m-control" type="button" aria-label="${msg("showPassword")}"
                                aria-controls="password" data-password-toggle tabindex="-1"
                                data-icon-show="fa fa-eye" data-icon-hide="fa fa-eye-slash"
                                data-label-show="${msg("showPassword")}" data-label-hide="${msg("hidePassword")}">
                            <i class="fa fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label for="password-confirm" class="pf-c-form__label pf-c-form__label-text">${msg("passwordConfirm")}</label>
                    <div class="pf-c-input-group">
                        <input type="password" id="password-confirm" class="pf-c-form-control" name="password-confirm" autocomplete="new-password" />
                        <button class="pf-c-button pf-m-control" type="button" aria-label="${msg("showPassword")}"
                                aria-controls="password-confirm" data-password-toggle tabindex="-1"
                                data-icon-show="fa fa-eye" data-icon-hide="fa fa-eye-slash"
                                data-label-show="${msg("showPassword")}" data-label-hide="${msg("hidePassword")}">
                            <i class="fa fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </#if>

            <div class="form-group form-group-buttons">
                <a href="${url.loginUrl}" class="pf-c-button pf-m-link back-link">← Zurück zur Anmeldung</a>
                <input type="submit" class="pf-c-button pf-m-primary" value="${msg("doRegister")}"/>
            </div>
        </form>
        <div id="domain-error" class="domain-error-message" style="display: none;">
            <div class="error-icon">⚠️</div>
            <div class="error-content">
                <h3>Nur HU Berlin E-Mail-Adressen zulässig</h3>
                <p>Die Registrierung ist ausschließlich für Angehörige der Humboldt-Universität zu Berlin möglich.</p>
                <div class="allowed-domains">
                    <span class="domain-tag">@iqb.hu-berlin.de</span>
                    <span class="domain-tag">@hu-berlin.de</span>
                    <span class="domain-tag">@campus.hu-berlin.de</span>
                </div>
            </div>
        </div>

        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
        <script>
            // Email domain validation for IQB/HU Berlin
            const allowedDomains = ['@iqb.hu-berlin.de', '@hu-berlin.de', '@campus.hu-berlin.de'];
            const emailInput = document.getElementById('email');
            const errorBox = document.getElementById('domain-error');

            function validateEmail() {
                const email = emailInput.value.toLowerCase().trim();
                if (!email) return true;

                const isValid = allowedDomains.some(domain => email.endsWith(domain));

                if (!isValid) {
                    errorBox.style.display = 'flex';
                    emailInput.classList.add('input-error');
                    return false;
                } else {
                    errorBox.style.display = 'none';
                    emailInput.classList.remove('input-error');
                    return true;
                }
            }

            // Validate on input (hide error when user fixes it)
            emailInput.addEventListener('input', function() {
                const email = emailInput.value.toLowerCase().trim();
                if (email && allowedDomains.some(domain => email.endsWith(domain))) {
                    errorBox.style.display = 'none';
                    emailInput.classList.remove('input-error');
                }
            });

            // Validate on form submit
            document.getElementById('kc-register-form').addEventListener('submit', function(e) {
                if (!validateEmail()) {
                    e.preventDefault();
                    emailInput.focus();
                    emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        </script>
    </#if>
</@layout.registrationLayout>
