package com.dormtrading.iam.auth;

import java.time.Clock;
import java.security.SecureRandom;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableScheduling
public class AuthConfiguration {
    @Bean Clock authClock() { return Clock.systemUTC(); }
    @Bean SecureRandom authRandom() { return new SecureRandom(); }
    @Bean PasswordEncoder passwordEncoder() {
        return new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
    }
}
