package com.email_writer.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Configuration
public class WebClientConfig {

    @Bean
    public WebClient.Builder webClientBuilder() {
        // Connection pool — prevents "connection reset" on reused stale connections
        ConnectionProvider provider = ConnectionProvider.builder("groq-pool")
                .maxConnections(20)
                .maxIdleTime(Duration.ofSeconds(20))       // close idle connections before Groq drops them
                .maxLifeTime(Duration.ofSeconds(60))
                .pendingAcquireTimeout(Duration.ofSeconds(10))
                .evictInBackground(Duration.ofSeconds(30)) // evict stale connections proactively
                .build();

        HttpClient httpClient = HttpClient.create(provider)
                // TCP connect timeout
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000)
                // Keep-alive to prevent silent connection drops
                .option(ChannelOption.SO_KEEPALIVE, true)
                // Response timeout — Groq can be slow on first call
                .responseTimeout(Duration.ofSeconds(60))
                .doOnConnected(conn -> conn
                        .addHandlerLast(new ReadTimeoutHandler(60, TimeUnit.SECONDS))
                        .addHandlerLast(new WriteTimeoutHandler(15, TimeUnit.SECONDS))
                )
                // Follow redirects
                .followRedirect(true);

        // Increase buffer size for large AI responses
        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(cfg -> cfg.defaultCodecs().maxInMemorySize(4 * 1024 * 1024)) // 4MB
                .build();

        return WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .exchangeStrategies(strategies);
    }
}