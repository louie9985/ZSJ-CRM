import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

const { useI18n, ofTypeI18n } = i18nBuilder
    .withThemeName<ThemeName>()
    .withCustomTranslations({
        "zh-CN": {
            usernameOrEmail: "用户名或手机号",
            username: "用户名或手机号",
            password: "密码",
            doLogIn: "登录",
            updatePasswordTitle: "设置新密码",
            passwordNew: "新密码",
            passwordConfirm: "确认新密码",
            passwordPolicyDescription: "密码要求：8-64 位，仅可使用半角英文字母、数字、空格和英文符号，不支持中文或全角字符。",
            passwordPolicyViolation: "请确认两次输入一致，并使用 8-64 位半角英文字母、数字、空格或英文符号。",
            doSubmit: "确认",
            credentialCeremonyTitle: "设置临时密码",
            credentialCeremonyDescription: "设置后，该账号首次登录时需要修改密码。",
            credentialCeremonyInvalidPassword: "两次密码输入不一致，或密码不符合以下要求。",
            credentialCeremonyUnavailableTitle: "链接不可用",
            credentialCeremonyUnavailableDescription: "此链接无效或已过期，请返回工作台重新发起。"
        }
    })
    .build();

export type I18n = typeof ofTypeI18n;
export { useI18n };
