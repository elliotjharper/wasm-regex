using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

/// <summary>
/// Regex API exported to JavaScript via [JSExport].
/// All methods return JSON strings so they are usable from plain JS/TypeScript
/// without any additional marshalling.
/// </summary>
[SupportedOSPlatform("browser")]
public partial class RegexApi
{
    private static readonly TimeSpan MatchTimeout = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Find all matches of <paramref name="pattern"/> in <paramref name="input"/>.
    /// </summary>
    /// <param name="pattern">ECMAScript-style regex pattern.</param>
    /// <param name="input">The string to search.</param>
    /// <param name="flags">
    /// Any combination of: "i" (ignore case), "m" (multiline), "s" (single-line / dotall).
    /// </param>
    /// <returns>
    /// JSON array of match objects: <c>[{value,index,length,groups:[...]}]</c>,
    /// or <c>{error:"parse"|"timeout", message:"..."}</c> on failure.
    /// </returns>
    [JSExport]
    public static string FindMatches(string pattern, string input, string flags)
    {
        try
        {
            var options = ParseFlags(flags);
            var regex = new Regex(pattern, options, MatchTimeout);
            var results = new List<MatchResult>();
            foreach (Match m in regex.Matches(input))
            {
                var groups = new List<string>();
                for (int i = 1; i < m.Groups.Count; i++)
                    groups.Add(m.Groups[i].Value);
                results.Add(new MatchResult(m.Value, m.Index, m.Length, groups));
            }
            return JsonSerializer.Serialize(results, RegexJsonContext.Default.ListMatchResult);
        }
        catch (RegexParseException ex)
        {
            return SerializeError("parse", ex.Message);
        }
        catch (RegexMatchTimeoutException)
        {
            return SerializeError("timeout", "Regex match timed out (possible catastrophic backtracking).");
        }
    }

    /// <summary>
    /// Replace all occurrences of <paramref name="pattern"/> in <paramref name="input"/>
    /// with <paramref name="replacement"/>. Supports backreferences ($1, $2, …).
    /// </summary>
    /// <returns>
    /// JSON object: <c>{result:"…"}</c> on success,
    /// or <c>{error:"parse"|"timeout", message:"…"}</c> on failure.
    /// </returns>
    [JSExport]
    public static string ReplaceAll(string pattern, string input, string replacement, string flags)
    {
        try
        {
            var options = ParseFlags(flags);
            var regex = new Regex(pattern, options, MatchTimeout);
            var result = regex.Replace(input, replacement);
            return JsonSerializer.Serialize(new ReplaceResult(result), RegexJsonContext.Default.ReplaceResult);
        }
        catch (RegexParseException ex)
        {
            return SerializeError("parse", ex.Message);
        }
        catch (RegexMatchTimeoutException)
        {
            return SerializeError("timeout", "Regex match timed out (possible catastrophic backtracking).");
        }
    }

    /// <summary>
    /// Validate that <paramref name="pattern"/> is a syntactically correct .NET regex.
    /// </summary>
    /// <returns>
    /// Empty string <c>""</c> if the pattern is valid, otherwise the parse error message.
    /// </returns>
    [JSExport]
    public static string Validate(string pattern)
    {
        try
        {
            _ = new Regex(pattern, RegexOptions.None, MatchTimeout);
            return string.Empty;
        }
        catch (RegexParseException ex)
        {
            return ex.Message;
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static RegexOptions ParseFlags(string flags)
    {
        var opts = RegexOptions.None;
        if (flags.Contains('i')) opts |= RegexOptions.IgnoreCase;
        if (flags.Contains('m')) opts |= RegexOptions.Multiline;
        if (flags.Contains('s')) opts |= RegexOptions.Singleline;
        return opts;
    }

    private static string SerializeError(string kind, string message)
        => JsonSerializer.Serialize(new ErrorResult(kind, message), RegexJsonContext.Default.ErrorResult);
}

// ── data models ──────────────────────────────────────────────────────────────

internal record MatchResult(
    [property: JsonPropertyName("value")]  string Value,
    [property: JsonPropertyName("index")]  int Index,
    [property: JsonPropertyName("length")] int Length,
    [property: JsonPropertyName("groups")] List<string> Groups);

internal record ReplaceResult(
    [property: JsonPropertyName("result")] string Result);

internal record ErrorResult(
    [property: JsonPropertyName("error")]   string Error,
    [property: JsonPropertyName("message")] string Message);

// Trim-safe JSON source generation
[JsonSerializable(typeof(List<MatchResult>))]
[JsonSerializable(typeof(ReplaceResult))]
[JsonSerializable(typeof(ErrorResult))]
internal partial class RegexJsonContext : JsonSerializerContext { }
