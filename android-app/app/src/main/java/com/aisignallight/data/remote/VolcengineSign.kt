package com.aisignallight.data.remote

import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * 火山引擎 OpenAPI V4 签名。规范见官方文档
 * https://www.volcengine.com/docs/6369/67269
 *
 * 桌面端 `src/main/volcengine-sign.ts` 是同一套实现，两端共用官方文档 GET 示例的
 * 测试向量（见 VolcengineSignTest），任何一侧跑偏都会立刻在单测里暴露。
 *
 * 注意：派生链每一步都用上一步的**原始二进制摘要**作为 HMAC 密钥。官方文档正文写的是
 * hex 字符串，但文档自带的 Java 示例用二进制，且文档公布的 Signature 只有二进制能复现。
 */
object VolcengineSign {

    private const val ALGORITHM = "HMAC-SHA256"

    /** 参与签名的请求头（官方 GET 示例的最小集） */
    const val SIGNED_HEADERS = "host;x-date"

    /** 空 body 的 SHA256，CanonicalRequest 末行固定用它 */
    const val EMPTY_PAYLOAD_SHA256 =
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    /** RFC3986 的 unreserved 集合：这些字符原样保留，其余一律百分号编码 */
    private const val UNRESERVED =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~"

    private val X_DATE_FORMATTER: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)

    data class Input(
        val host: String,
        val region: String,
        val service: String,
        val action: String,
        val version: String,
        val query: Map<String, String> = emptyMap(),
        val body: String = "",
        val accessKey: String,
        val secretKey: String,
        val instant: Instant
    )

    data class Result(
        val headers: Map<String, String>,
        val canonicalQuery: String,
        val canonicalRequest: String,
        val stringToSign: String,
        val signature: String
    )

    /** RFC3986 编码：非 unreserved 字符按 UTF-8 字节逐个 %XX（空格必须是 %20，不能是 +） */
    fun rfc3986(value: String): String {
        val sb = StringBuilder()
        for (b in value.toByteArray(Charsets.UTF_8)) {
            val ch = (b.toInt() and 0xFF).toChar()
            if (UNRESERVED.indexOf(ch) >= 0) {
                sb.append(ch)
            } else {
                sb.append('%').append(String.format(Locale.ROOT, "%02X", b.toInt() and 0xFF))
            }
        }
        return sb.toString()
    }

    /** 查询参数按 key 的 ASCII 升序排序后拼成 canonical 形式 */
    fun canonicalQuery(params: Map<String, String>): String =
        params.keys.sorted().joinToString("&") { "${rfc3986(it)}=${rfc3986(params[it] ?: "")}" }

    /** X-Date：UTC 的 YYYYMMDDTHHMMSSZ */
    fun formatXDate(instant: Instant): String = X_DATE_FORMATTER.format(instant)

    fun sha256Hex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { String.format(Locale.ROOT, "%02x", it) }

    private fun hmacSha256(key: ByteArray, content: String): ByteArray =
        Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(key, "HmacSHA256"))
            doFinal(content.toByteArray(Charsets.UTF_8))
        }

    /** kSecret → kDate → kRegion → kService → kSigning，每步以上一步的二进制摘要为密钥 */
    private fun deriveSigningKey(
        secretKey: String,
        date: String,
        region: String,
        service: String
    ): ByteArray {
        val kDate = hmacSha256(secretKey.toByteArray(Charsets.UTF_8), date)
        val kRegion = hmacSha256(kDate, region)
        val kService = hmacSha256(kRegion, service)
        return hmacSha256(kService, "request")
    }

    fun sign(input: Input): Result {
        val xDate = formatXDate(input.instant)
        val shortDate = xDate.substring(0, 8)
        val payloadHash = if (input.body.isEmpty()) EMPTY_PAYLOAD_SHA256 else sha256Hex(input.body)

        val allQuery = mapOf("Action" to input.action, "Version" to input.version) + input.query
        val query = canonicalQuery(allQuery)
        val canonicalHeaders = "host:${input.host}\nx-date:$xDate\n"

        val canonicalRequest = listOf(
            "GET",
            "/",
            query,
            canonicalHeaders,
            SIGNED_HEADERS,
            payloadHash
        ).joinToString("\n")

        val credentialScope = "$shortDate/${input.region}/${input.service}/request"
        val stringToSign = listOf(
            ALGORITHM,
            xDate,
            credentialScope,
            sha256Hex(canonicalRequest)
        ).joinToString("\n")

        val kSigning = deriveSigningKey(input.secretKey, shortDate, input.region, input.service)
        val signature = hmacSha256(kSigning, stringToSign)
            .joinToString("") { String.format(Locale.ROOT, "%02x", it) }

        val authorization = "$ALGORITHM Credential=${input.accessKey}/$credentialScope, " +
            "SignedHeaders=$SIGNED_HEADERS, Signature=$signature"

        return Result(
            headers = mapOf(
                "Host" to input.host,
                "X-Date" to xDate,
                "Authorization" to authorization
            ),
            canonicalQuery = query,
            canonicalRequest = canonicalRequest,
            stringToSign = stringToSign,
            signature = signature
        )
    }

    /** 与签名结果一致的请求 URL（查询串必须复用 canonical 形式） */
    fun buildUrl(host: String, canonicalQuery: String): String =
        "https://$host/?$canonicalQuery"
}
