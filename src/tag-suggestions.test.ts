import selectBoorus from "./booru-selector.js";
import inputTags from "./tag-input.js";
import suggestTags from "./tag-suggestions.js";

const boorus = await selectBoorus();
const tags = await inputTags(boorus);

for (const booru of boorus) {
  const suggestions = await suggestTags(booru, tags);

  console.log(suggestions);
}
