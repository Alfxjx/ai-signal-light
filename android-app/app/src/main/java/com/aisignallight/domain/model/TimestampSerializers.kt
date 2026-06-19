package com.aisignallight.domain.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

/** 把 jsonl / ISO 字符串或数字统一反序列化为 epoch 毫秒 Long。 */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
object EpochMsSerializer : KSerializer<Long?> {
    override val descriptor = PrimitiveSerialDescriptor("EpochMs", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Long?) {
        if (value != null) encoder.encodeString(value.toString()) else encoder.encodeNull()
    }

    override fun deserialize(decoder: Decoder): Long? {
        val jsonDecoder = decoder as? JsonDecoder ?: return null
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val text = (element as? JsonPrimitive)?.content ?: return null
        return text.toLongOrNull()
            ?: runCatching { Instant.parse(text).toEpochMilli() }.getOrNull()
    }
}
