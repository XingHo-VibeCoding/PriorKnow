/**
 * 入口层的响应工具（Day 19 从 index.js 拆出）。
 *
 * 只做「怎么把结果写成 HTTP 响应」，不含任何业务判断 ——
 * 这样以后加 PATCH / DELETE，响应形状不用再抄一遍。
 */
/**
 * 统一出口：返回官方定义的 IntegrationResponse。
 *
 * body 传对象框架也能序列化，但显式 JSON.stringify 更可控 ——
 * 能保证 Content-Type 与实际内容一致，不依赖框架的猜测。
 */
function reply(statusCode, body, extraHeaders) {
  return replyRaw(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders || {}),
  }, JSON.stringify(body))
}

/** 原样返回（用于 204 这种没有 body 的响应）。 */
function replyRaw(statusCode, headers, body) {
  return { statusCode, headers, body }
}

/** HTTP 头的键大小写不固定，统一按小写比对取值。 */
function readHeader(headers, name) {
  if (!headers) return undefined
  const target = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key]
  }
  return undefined
}

module.exports = { reply, replyRaw, readHeader }
