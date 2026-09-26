package com.campus;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DormTradingApplication {

	public static void main(String[] args) {
		// PostgreSQL connections and persisted instants use UTC on every developer machine.
		java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("UTC"));
		SpringApplication.run(DormTradingApplication.class, args);
	}

}
