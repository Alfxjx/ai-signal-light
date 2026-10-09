package com.aisignallight.data.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * 用火山引擎官方文档（https://www.volcengine.com/docs/6369/67269）GET 示例的
 * 公布值锁死签名。桌面端 `src/main/volcengine-sign.test.ts` 断言的是同一组值，
 * 两端任一实现跑偏都会在这里/那里立刻暴露。
 */
class VolcengineSignTest {

    private val ak = "AKLTYWViMTVmZGYzM2E0NDI5Mzk2MDZjNjFmMjc2MjRjMzg"
    private val sk = "WkRZeE1EQmxPVGhsWWpWak5HVmtNbUUxTXpZeU9UVXlOMlE1TmpZeVlqTQ=="
    private val docInstant: Instant = Instant.parse("2025-03-29T18:09:37Z")
    private val docCanonicalHash =
        "43171c1658c64b5db55c58d54988a4598d2d09a5613136beaa5eef40eae6e2c1"
    private val docSignature =
        "1eda9e7e6b1728151a8e8791fdaf67cfbd28bd5c80d0fce2eb208746cf483105"

    private fun docInput() = VolcengineSign.Input(
        host = "billing.volcengineapi.com",
        region = "cn-beijing",
        service = "billing",
        action = "QueryBalanceAcct",
        version = "2022-01-01",
        accessKey = ak,
        secretKey = sk,
        instant = docInstant
    )

    @Test
    fun formatXDate_utcBasic() {
        assertEquals("20250329T180937Z", VolcengineSign.formatXDate(docInstant))
    }

    @Test
    fun rfc3986_spaceIsPercent20() {
        assertEquals("a%20b", VolcengineSign.rfc3986("a b"))
    }

    @Test
    fun rfc3986_escapesEncodeUriComponentLeftovers() {
        assertEquals("a%21b%27c%28d%29e%2Af", VolcengineSign.rfc3986("a!b'c(d)e*f"))
    }

    @Test
    fun rfc3986_keepsUnreserved() {
        assertEquals("a-b_c.d~e", VolcengineSign.rfc3986("a-b_c.d~e"))
    }

    @Test
    fun rfc3986_chineseAsUtf8Bytes() {
        assertEquals("%E5%90%8D", VolcengineSign.rfc3986("名"))
    }

    @Test
    fun canonicalQuery_sortedByAsciiKey() {
        val q = VolcengineSign.canonicalQuery(
            mapOf("Version" to "v", "Action" to "a", "Region" to "cn-beijing")
        )
        assertEquals("Action=a&Region=cn-beijing&Version=v", q)
    }

    @Test
    fun emptyBodyHash_matchesSha256OfEmptyString() {
        assertEquals(VolcengineSign.EMPTY_PAYLOAD_SHA256, VolcengineSign.sha256Hex(""))
    }

    @Test
    fun canonicalRequest_matchesDocExample() {
        val expected = listOf(
            "GET",
            "/",
            "Action=QueryBalanceAcct&Version=2022-01-01",
            "host:billing.volcengineapi.com",
            "x-date:20250329T180937Z",
            "",
            VolcengineSign.SIGNED_HEADERS,
            VolcengineSign.EMPTY_PAYLOAD_SHA256
        ).joinToString("\n")
        assertEquals(expected, VolcengineSign.sign(docInput()).canonicalRequest)
    }

    @Test
    fun canonicalRequestHash_matchesDocValue() {
        assertEquals(docCanonicalHash, VolcengineSign.sha256Hex(VolcengineSign.sign(docInput()).canonicalRequest))
    }

    @Test
    fun signature_matchesDocValue() {
        // 这一条同时锁死「派生链用二进制摘要而非 hex 字符串」这个关键结论
        assertEquals(docSignature, VolcengineSign.sign(docInput()).signature)
    }

    @Test
    fun stringToSign_hasFourLines() {
        val expected = listOf(
            "HMAC-SHA256",
            "20250329T180937Z",
            "20250329/cn-beijing/billing/request",
            docCanonicalHash
        ).joinToString("\n")
        assertEquals(expected, VolcengineSign.sign(docInput()).stringToSign)
    }

    @Test
    fun authorizationHeader_matchesDocFormat() {
        val headers = VolcengineSign.sign(docInput()).headers
        assertEquals("billing.volcengineapi.com", headers["Host"])
        assertEquals("20250329T180937Z", headers["X-Date"])
        assertEquals(
            "HMAC-SHA256 Credential=$ak/20250329/cn-beijing/billing/request, " +
                "SignedHeaders=host;x-date, Signature=$docSignature",
            headers["Authorization"]
        )
    }

    @Test
    fun signatureChangesWithTime() {
        val later = VolcengineSign.sign(
            docInput().copy(instant = Instant.parse("2025-03-29T18:09:38Z"))
        )
        assertNotEquals(docSignature, later.signature)
    }

    @Test
    fun codingPlanQuery_includesRegionSorted() {
        val signed = VolcengineSign.sign(
            VolcengineSign.Input(
                host = "open.volcengineapi.com",
                region = "cn-beijing",
                service = "ark",
                action = "GetCodingPlanUsage",
                version = "2024-01-01",
                query = mapOf("Region" to "cn-beijing"),
                accessKey = ak,
                secretKey = sk,
                instant = docInstant
            )
        )
        assertEquals(
            "Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01",
            signed.canonicalQuery
        )
        assertTrue(signed.headers["Authorization"]!!.contains("/20250329/cn-beijing/ark/request"))
        assertTrue(signed.signature.matches(Regex("^[0-9a-f]{64}$")))
        assertEquals(
            "https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01",
            VolcengineSign.buildUrl("open.volcengineapi.com", signed.canonicalQuery)
        )
    }
}
