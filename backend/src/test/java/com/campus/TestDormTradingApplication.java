package com.campus;

import org.springframework.boot.SpringApplication;

public class TestDormTradingApplication {

	public static void main(String[] args) {
		SpringApplication.from(DormTradingApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
