import { assert } from "chai";
import { describe, it } from "mocha";
import { hasMatch } from "../src/subscription";

describe("Full Keyword Tests", () => {
	it("should match when keyword is entire text", () => {
		const keywords = ["keyword"];
		assert(hasMatch("keyword", keywords, [], []));
	});

	it("should match when keyword is within text", () => {
		const keywords = ["b"];
		assert(hasMatch("a b c", keywords, [], []));
	});

	it("should match when keyword is at the start of text", () => {
		const keywords = ["a"];
		assert(hasMatch("a b c", keywords, [], []));
	});

	it("should match when keyword is at the end of text", () => {
		const keywords = ["c"];
		assert(hasMatch("a b c", keywords, [], []));
	});

	it("should match when keyword is at the end of text with punctuation", () => {
		const keywords = ["c"];
		const text = "a b c";
		const punctuation = [",", ".", "!", "?"];
		for (const p of punctuation) {
			assert(hasMatch(text + p, keywords, [], []));
		}
	});

	it("should match when keyword is at the end of text with multiple spaces", () => {
		const keywords = ["c"];
		assert(hasMatch("a b c  ", keywords, [], []));
	});

	it("should match when keyword is at the start of text with multiple spaces", () => {
		const keywords = ["a"];
		assert(hasMatch("  a b c", keywords, [], []));
	});

	it("should match when keyword is a hashtag", () => {
		const keywords = ["#a"];
		assert(hasMatch("#a b c", keywords, [], []));
	});

	it("should skip when keyword is not in text", () => {
		const keywords = ["d"];
		assert(!hasMatch("a b c", keywords, [], []));
	});

	it("should skip when keyword is only a partial match at the beginning", () => {
		const keywords = ["a"];
		assert(!hasMatch("ab c", keywords, [], []));
	});

	it("should skip when keyword is only a partial match at the end", () => {
		const keywords = ["c"];
		assert(!hasMatch("a bc", keywords, [], []));
	});

	it("should match when keyword has punctuation", () => {
		const keywords = ["key.word"];
		assert(hasMatch("key.word", keywords, [], []));
	});

	it("should skip when keyword has different punctuation", () => {
		const keywords = ["key.word"];
		assert(!hasMatch(" key!word ", keywords, [], []));
	});

	it("should match when keyword has a different case", () => {
		const keywords = ["key"];
		assert(hasMatch("Key", keywords, [], []));
	});

	it("should match when keyword is before a line break", () => {
		const keywords = ["key"];
		assert(hasMatch("key\nother", keywords, [], []));
	});
});

describe("Partial Keyword Tests", () => {
	it("should match when partial keyword is entire text", () => {
		const partialKeywords = ["keyword"];
		assert(hasMatch("keyword", [], partialKeywords, []));
	});

	it("should match when partial keyword is within text as separate word", () => {
		const partialKeywords = ["b"];
		assert(hasMatch("a b c", [], partialKeywords, []));
	});

	it("should match when partial keyword is within text as part of a word", () => {
		const partialKeywords = ["b"];
		assert(hasMatch("a abc d", [], partialKeywords, []));
	});

	it("should match when partial keyword is at the start of inner text", () => {
		const partialKeywords = ["b"];
		assert(hasMatch("a bcd e", [], partialKeywords, []));
	});

	it("should match when partial keyword is at the end of inner text", () => {
		const partialKeywords = ["d"];
		assert(hasMatch("a bcd e", [], partialKeywords, []));
	});

	it("should match when partial keyword contains URL punctuation", () => {
		const partialKeywords = ["https://github.com/"]
		assert(hasMatch("https://github.com/example/one", [], partialKeywords, []));
	});

	it("should skip when partial keyword is not in text", () => {
		const partialKeywords = ["d"];
		assert(!hasMatch("a b c", [], partialKeywords, []));
	});
});

describe("Negative Keyword Tests", () => {
	it("should skip when negative keyword is entire text", () => {
		const negativeKeywords = ["keyword"];
		assert(!hasMatch("keyword", [], [], negativeKeywords));
	});

	it("should skip when negative keyword is within text", () => {
		const negativeKeywords = ["b"];
		assert(!hasMatch("a b c", [], [], negativeKeywords));
	});

	it("should skip when negative keyword is at the start of text", () => {
		const negativeKeywords = ["a"];
		assert(!hasMatch("a b c", [], [], negativeKeywords));
	});

	it("should skip when negative keyword is entire text and full keyword is the same as negative", () => {
		const keywords = ["keyword"];
		const negativeKeywords = ["keyword"];
		assert(!hasMatch("keyword", keywords, [], negativeKeywords));
	});

	it("should skip when negative keyword is within text and full keyword is present", () => {
		const keywords = ["b"];
		const negativeKeywords = ["c"];
		assert(!hasMatch("a b c", keywords, [], negativeKeywords));
	});
	
	it("should skip when negative keyword is within text and partial keyword is present", () => {
		const partialKeywords = ["b"];
		const negativeKeywords = ["c"];
		assert(!hasMatch("a b c", [], partialKeywords, negativeKeywords));
	});

	it("should skip when negative keyword is a URL", () => {
		const keywords = ["match"];
		const negativeKeywords = ["bit.ly"];
		assert(!hasMatch("match https://bit.ly/abc", keywords, [], negativeKeywords));
	});

	it("should skip when negative keyword is a hashtag", () => {
		const keywords = ["match"];
		const negativeKeywords = ["#a"];
		assert(!hasMatch("match #a", keywords, [], negativeKeywords));
	});
});
