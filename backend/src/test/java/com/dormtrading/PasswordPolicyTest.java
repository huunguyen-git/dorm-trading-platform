package com.dormtrading;
import com.dormtrading.iam.auth.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class PasswordPolicyTest {
    private final PasswordPolicy policy=new PasswordPolicy(false);
    @Test void boundariesSpacesAndUnicode() {
        assertThatThrownBy(() -> policy.validate("a".repeat(14),"student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class);
        assertThat(policy.validate("a".repeat(15),"student@uni.edu.vn","12345")).hasSize(15);
        assertThat(policy.validate("a".repeat(128),"student@uni.edu.vn","12345")).hasSize(128);
        assertThatThrownBy(() -> policy.validate("a".repeat(129),"student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class);
        assertThat(policy.validate("một dòng sông dưới trời xanh","student@uni.edu.vn","12345")).contains(" ");
        assertThat(policy.validate("🌊".repeat(15),"student@uni.edu.vn","12345").codePointCount(0,30)).isEqualTo(15);
    }
    @Test void rejectsPredictableAndAccountRelatedValues() {
        assertThatThrownBy(() -> policy.validate("passwordpassword","student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(() -> policy.validate("student has a long phrase","student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class);
    }
    @Test @SuppressWarnings("unchecked") void breachLookupUsesOnlyPrefixAndFailsClosed() throws Exception {
        var http=org.mockito.Mockito.mock(java.net.http.HttpClient.class);
        var response=(java.net.http.HttpResponse<String>)org.mockito.Mockito.mock(java.net.http.HttpResponse.class);
        org.mockito.Mockito.doReturn(response).when(http).send(org.mockito.ArgumentMatchers.any(java.net.http.HttpRequest.class),org.mockito.ArgumentMatchers.any(java.net.http.HttpResponse.BodyHandler.class));
        String value="a quiet river beneath stars";
        String hash=java.util.HexFormat.of().withUpperCase().formatHex(java.security.MessageDigest.getInstance("SHA-1").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        org.mockito.Mockito.when(response.statusCode()).thenReturn(200);
        org.mockito.Mockito.when(response.body()).thenReturn(hash.substring(5)+":12");
        var checked=new PasswordPolicy(true,http);
        assertThatThrownBy(() -> checked.validate(value,"student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class).extracting("code").isEqualTo("WEAK_PASSWORD");
        var request=org.mockito.ArgumentCaptor.forClass(java.net.http.HttpRequest.class);
        org.mockito.Mockito.verify(http).send(request.capture(),org.mockito.ArgumentMatchers.any(java.net.http.HttpResponse.BodyHandler.class));
        assertThat(request.getValue().uri().toString()).isEqualTo("https://api.pwnedpasswords.com/range/"+hash.substring(0,5));
        assertThat(request.getValue().headers().firstValue("Add-Padding")).contains("true");
        org.mockito.Mockito.when(response.statusCode()).thenReturn(503);
        assertThatThrownBy(() -> checked.validate(value,"student@uni.edu.vn","12345")).isInstanceOf(AuthFailure.class).extracting("status").isEqualTo(503);
    }
}
