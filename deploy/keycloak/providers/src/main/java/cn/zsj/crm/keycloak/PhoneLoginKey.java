package cn.zsj.crm.keycloak;

import java.util.Optional;
import java.util.regex.Pattern;

final class PhoneLoginKey {
    static final String ATTRIBUTE = "phone_login_key";
    private static final Pattern SEPARATORS = Pattern.compile("[ -]");
    private static final Pattern VALID = Pattern.compile("\\+?[0-9]{6,20}");

    private PhoneLoginKey() {}

    static Optional<String> normalize(String input) {
        if (input == null) {
            return Optional.empty();
        }
        String normalized = SEPARATORS.matcher(input.trim()).replaceAll("");
        return VALID.matcher(normalized).matches() ? Optional.of(normalized) : Optional.empty();
    }
}
