package com.campus.shared.security;

import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {
    private SecurityUtils() {}

    public static UUID currentMemberId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal() == null) {
            return null;
        }
        Object principal = auth.getPrincipal();
        // WithMockUser uses String username as principal name
        String name = auth.getName();
        if (name == null) return null;
        try {
            return UUID.fromString(name);
        } catch (IllegalArgumentException e) {
            // Try principal directly if it's UUID
            if (principal instanceof UUID uuid) return uuid;
            if (principal instanceof String s) {
                try { return UUID.fromString(s); } catch (Exception ex) { return null; }
            }
            return null;
        }
    }

    public static boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role) || a.getAuthority().equals(role));
    }
}
