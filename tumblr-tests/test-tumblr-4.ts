import process from "node:process";
import util from "node:util";
import undici from "undici";

util.inspect.defaultOptions.depth = Infinity;

const SID = process.env.TUMBLR_SID;

// fetch("https://www.tumblr.com/api/v2/blog/t:eza4OIi9Ry6Sqmg8YWdjhA/posts", {
//   headers: {
//     accept: "application/json;format=camelcase",
//     "accept-language": "en-us",
//     authorization: "Bearer aIcXSOoTtqrzR8L8YEIOmBeW94c3FmbSNSWAUbxsny9KKx5VFh",
//     "cache-control": "no-cache",
//     "content-type": "application/json; charset=utf8",
//     pragma: "no-cache",
//     "sec-ch-ua":
//       '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
//     "sec-ch-ua-mobile": "?0",
//     "sec-ch-ua-platform": '"Windows"',
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-origin",
//     "x-ad-blocker-enabled": "0",
//     "x-csrf": "gsOXlbMOmoEL.1694770664",
//     "x-version": "redpop/3/0//redpop/",
//     cookie:
//       "tmgioct=634f8af0d3de450993955310; tz=Europe%2FMoscow; tth=NjU3MLIyRNWOirJENDc3NjSwMjUySaucazG2sIBjWg2MDI1ZWgwNQNxN3xDXZQAcVgvK; pfu=464786574; cl_pref=show; search-displayMode=2; blog-view-timeline-display-mode=0; devicePixelRatio=1; logged_in=1; documentWidth=1592; sid=aA5rMlPppm3K4FAlUWtME0Hg0BImTcBq1hvccVifor4Zi8ehzU.axZe49KqC0ZMQ9C46617THW7op6hZKNm4hTKILniqs04eblRnc",
//     Referer:
//       "https://www.tumblr.com/reblog/magnalunaarts/180595404168/WqrB5uyH",
//     "Referrer-Policy": "strict-origin-when-cross-origin",
//   },
//   body: '{"placement_id":"vCJkH+0cFoxoB1pXCIsdbJQSg1tqp5b+yTbjSFdAWENbz7VccEeYKsczSGV+IylBSCPQqVVjiX5tkMX5jtHSlXpEXnU76+2PFwNiG5C6E1OwOWjXJcVTfqm+5zBsWV9xuii6NNJHQyb6JqwdVl+4JC43mTCnWazImAPbuTkYI73XtsFwyxSgGPPIKIpXBX5xjvF6tW2BYP/IUcBD3kP7FdBUlxKplNESsSy2RDXJOg75PwyeNmbyT0pFBP5TLLv7JmSRsQOj40iJw3F1DBVREUg0/byHsPn5aDxwMyhUGlloVUtmMfJ5bXFYgqibGdjRtTVCJx5QdupZkXVVxGCvpTN72rU6KyL5K4xe+ZjFqIQ/o1UtAspfoaAvdw5UIfu/4oFi1jI83qvRuR3y8D6kyBvOr1TLAW/lJhaa+SNgXGPpfzjA1YB8+mI5Vp7ytaejcCTnAIslOyb6KezmwuvL4jj7mjNZ+eIX+tLagiREgDm7dQsjQGhliHx6ee/ARIkzgQ6afjK3kcjmVuanU/O/HwjzBEh/+zbUzE5DuCb5PI/FnjBj1Wxk6jkrqzqjnepWXld5XQu4CZMNfjzcXoNOzR5Ue5iTJVgFD5y7+G8XRVhPmMldrxOD8XdCpzQU+DXWSAQRDATsB6I1JYX6k/68WcqsVydsXTclXXyyN+mTuRk=","layout":[{"type":"rows","display":[{"blocks":[0]}]}],"state":"draft","send_to_twitter":false,"reblog_key":"WqrB5uyH","hide_trail":false,"parent_tumblelog_uuid":"t:8nGmeDB2Iykr1jmcp_SqCg","parent_post_id":"180595404168","content":[{"type":"text","text":""}],"can_be_tipped":null,"interactability_reblog":"everyone","tags":"","has_community_label":false,"community_label_categories":[]}',
//   method: "POST",
// });

const d = await undici
  .request("https://www.tumblr.com/api/v2/blog/fggfgfdgdfgd/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `sid=${SID}`,
      "x-csrf": "vmdlABXU49fF.1694780674",
    },
    body: JSON.stringify({
      // layout: [{ type: "rows", display: [{ blocks: [0] }] }],
      state: "draft",
      // send_to_twitter: false,
      reblog_key: "b9hODC91",
      // hide_trail: false,
      parent_tumblelog_uuid: "t:Q8fZku7raIS4du8R2DlniA",
      parent_post_id: "102426447049",
      // content: [{ type: "text", text: "" }],
    }),
    throwOnError: true,
  })
  .then((r) => r.body.json());
console.log(d);
