<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!} login-pf" lang="${locale.currentLanguageTag}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${msg("loginTitle",realm.displayName!realm.name!"")}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.styles?has_content>
        <#list properties.styles?split(" ") as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
</head>
<body class="${properties.kcBodyClass!}">
<div class="login-pf-page">
    <div id="kc-header" class="login-pf-page-header">
        <div id="kc-header-wrapper" class="">
            <img src="${url.resourcesPath}/img/logo.png" alt="IQB ContentPool" class="kc-logo-img"/>
            <span class="kc-logo-text">IQB ContentPool</span>
        </div>
    </div>
    <div class="card-pf">
        <header class="login-pf-header">
            <#if locale?? && locale.supported?size gt 1>
                <div id="kc-locale">
                    <ul>
                        <#list locale.supported as l>
                            <li>
                                <a href="${l.url}">${l.label}</a>
                            </li>
                        </#list>
                    </ul>
                </div>
            </#if>
            <h1 id="kc-page-title">
                <#nested "header">
            </h1>
        </header>
        <div id="kc-content">
            <div id="kc-content-wrapper">
                <#if displayMessage && message?has_content>
                    <div class="alert-${message.type}">
                        <#if message.type = 'success'><span class="${properties.kcFeedbackSuccessIcon!}"></span></#if>
                        <#if message.type = 'warning'><span class="${properties.kcFeedbackWarningIcon!}"></span></#if>
                        <#if message.type = 'error'><span class="${properties.kcFeedbackErrorIcon!}"></span></#if>
                        <#if message.type = 'info'><span class="${properties.kcFeedbackInfoIcon!}"></span></#if>
                        <span class="kc-feedback-text">${kcSanitize(message.summary)?no_esc}</span>
                    </div>
                </#if>

                <#nested "form">

                <#if displayInfo>
                    <div id="kc-info" class="login-pf-signup">
                        <div id="kc-info-wrapper" class="">
                            <#nested "info">
                        </div>
                    </div>
                </#if>
            </div>
        </div>

        <#if displayRequiredFields>
            <div class="${properties.kcLabelWrapperClass!}">
                <span class="${properties.kcInputRequiredMarkerClass!}">*</span> ${msg("requiredFields")}
            </div>
        </#if>

        <#nested "socialProviders">
    </div>
</div>
</body>
</html>
</#macro>
