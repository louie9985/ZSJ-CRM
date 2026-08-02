import { lazy, Suspense } from "react";
import DefaultPage from "keycloakify/login/DefaultPage";
import Template from "keycloakify/login/Template";
import type { ClassKey } from "keycloakify/login";
import type { KcContext } from "./KcContext";
import { useI18n } from "./i18n";
import Login from "./Login";
import UpdatePassword from "./UpdatePassword";
import CredentialCeremony from "./CredentialCeremony";
import CredentialCeremonyError from "./CredentialCeremonyError";

const UserProfileFormFields = lazy(() => import("keycloakify/login/UserProfileFormFields"));
const classes = {} satisfies { [key in ClassKey]?: string };

export default function KcPage(props: { kcContext: KcContext }) {
    const { kcContext } = props;
    const { i18n } = useI18n({ kcContext });

    return (
        <Suspense>
            {kcContext.pageId === "login.ftl" ? (
                <Login kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss />
            ) : kcContext.pageId === "login-update-password.ftl" ? (
                <UpdatePassword kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss />
            ) : kcContext.pageId === "credential-ceremony.ftl" ? (
                <CredentialCeremony kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss />
            ) : kcContext.pageId === "credential-ceremony-error.ftl" ? (
                <CredentialCeremonyError kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss />
            ) : (
                <DefaultPage
                    kcContext={kcContext}
                    i18n={i18n}
                    classes={classes}
                    Template={Template}
                    doUseDefaultCss
                    UserProfileFormFields={UserProfileFormFields}
                    doMakeUserConfirmPassword
                />
            )}
        </Suspense>
    );
}
