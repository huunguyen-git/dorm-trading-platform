package com.dormtrading;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DormTradingApplication {

    public static void main(String[] args) {
        SpringApplication.run(DormTradingApplication.class, args);
    }
}
