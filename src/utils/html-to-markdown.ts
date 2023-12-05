import type { Parents, Root } from "mdast";
import type { Info, State } from "mdast-util-to-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

export function convertHtmlToMarkdown(html: string, dialect: string): string {
  if (dialect !== "derpibooru" && dialect !== "manebooru") {
    throw new Error(`Unsupported dialect: ${dialect}`);
  }

  const file = unified()
    .use(rehypeParse)
    .use(rehypeRemark)
    .use(() => (tree: Root) => {
      visit(
        tree,
        (node) => node.type === "link",
        (node, index, parent) => {
          if (
            node.type !== "link" ||
            index === undefined ||
            parent === undefined
          ) {
            return;
          }

          const deviantartOutgoingPrefix =
            "https://www.deviantart.com/users/outgoing?";
          if (node.url.startsWith(deviantartOutgoingPrefix)) {
            node.url = node.url.substring(deviantartOutgoingPrefix.length);
          }

          if (
            !new URL(node.url).href.includes(
              toMarkdown(node.children[0]).replace("…", "").slice(0, -1),
            )
          ) {
            return;
          }

          parent.children[index] = {
            type: "text",
            value: node.url,
          };
          return [SKIP, index];
        },
      );
    })
    .use(
      remarkStringify,
      {
        derpibooru: {},
        manebooru: {
          emphasis: "_",
          strong: "*",
          handlers: {
            link: (
              node: any,
              _: Parents | undefined,
              state: State,
              info: Info,
            ): string => {
              const tracker = state.createTracker(info);
              let exit = state.enter("link");

              let subexit = state.enter("label");
              let value = tracker.move('"');
              value += tracker.move(
                state.containerPhrasing(node, {
                  before: value,
                  after: '":',
                  ...tracker.current(),
                }),
              );
              value += tracker.move('":');
              subexit();

              subexit = state.enter("destinationRaw");
              value += tracker.move(
                state.safe(node.url, {
                  before: value,
                  after: "",
                  ...tracker.current(),
                }),
              );
              subexit();

              exit();
              return value;
            },
          },
        } as const,
      }[dialect],
    )
    .processSync(html);

  console.log(file);
  return String(file).replaceAll("\\\n", "\n");
}

const tests = [
  'Just fanart for my friends in fan-group and redraw of my old art with him <br />How would you rate my new eye style?<br /><br />My Telegram-channel with progresses: t.me/TaiWeiArtR <br />Also find me here:<br /><br />Ko-Fi: ko-fi.com/taiweiart<br />Patreon: patreon.com/TaiWeiArt<br /><br />Instagram: <a class="external" href="https://www.deviantart.com/users/outgoing?https://instagram.com/tai.wei.art">instagram.com/tai.wei.art</a><br /><br />Reddit: <a class="external" href="https://www.deviantart.com/users/outgoing?https://reddit.com/u/TaiWeiArt">reddit.com/u/TaiWeiArt</a><br /><br />Tumblr: <a class="external" href="https://www.deviantart.com/users/outgoing?https://www.tumblr.com/taiweiart">www.tumblr.com/taiweiart</a><br /><br />Twitter(X): <a class="external" href="https://www.deviantart.com/users/outgoing?https://x.com/_Tai_Wei_">x.com/_Tai_Wei_</a><br /><br />Discord: taiweiart<br /><br />TikTok: <a class="external" href="https://www.deviantart.com/users/outgoing?https://vm.tiktok.com/TaiWeiArt">vm.tiktok.com/TaiWeiArt</a><br /><br />Likee: <a class="external" href="https://www.deviantart.com/users/outgoing?https://l.likee.video/p/7uNBIx">l.likee.video/p/7uNBIx</a><br /><br />YouTube: <a class="external" href="https://www.deviantart.com/users/outgoing?https://youtube.com/@TaiWeiArt">youtube.com/@TaiWeiArt</a>',
  `<div><i><span>Soooo juicy and red</span><span>, I must have the last apple</span></i></div><div>=======================</div><div>Do you risk intervening to help the poor bat pone catch her fruit prey?<br /></div><div><br /></div><div>I've been navigating through some pretty frustrating life stuff, but figured I haven't done any art really since the Artist's Training's Ground event. Part of it was due to not really knowing what to draw, which is silly because I literally did 30 prompts of sketches. I don't know how I was convinced to go with a Nightmare Night theme, as I decided to start drawing this a week ago as a challenge. Every time it seems these pieces sit on my desk for weeks as I can't settle how to finish them so this was a nice change of pace.&nbsp;</div><div><br /></div><div>I think flutterbat turned out pretty decent and I enjoyed going the more "painterly" approach so I did not have to spend time on inking or clumsily handling lots of layers, yet admittedly I still did an extremely time consuming style of hair. Oh well, just enjoy the bat pone and have a fun Nightmare Night.<br /></div><div><br /></div><div><b>Original Sketch from EQD's ATG13 Event</b><br /></div>`,
  'ye yall probably saw this coming from a mile away&nbsp;<br /><br />V6 pony models by AeridicCore et al.<br /><a class="external" href="https://www.deviantart.com/users/outgoing?https://ponysfm.com/revamped-sfw-ponies-updated-release">ponysfm.com/revamped-sfw-ponie&hellip;</a>',
  '<span><br />Adopt belongs to&nbsp;</span><span>KatoNeg11 on Twitter<br /><br /></span><span><br /></span><span>Adoptable from this breeding Grid:&nbsp;</span><span class="shadow-holder" data-embed-type="deviation" data-embed-id="950347966" data-embed-format="thumb"><span class="shadow mild" ><a class="thumb" href="https://www.deviantart.com/redtsukini/art/Mane-Six-X-Royal-Princesses-Breeding-Chart-OPEN-950347966" title="Mane Six X Royal Princesses Breeding Chart (OPEN) by RedTsukini, Feb 20, 2023 in Visual Art"data-super-img="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fill/w_920,h_869,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-pre.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ" data-super-width="920" data-super-height="869" data-super-transparent="false" data-super-alt="Mane Six X Royal Princesses Breeding Chart (OPEN) by RedTsukini" data-super-full-img="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.x58t7jtoCz3DvN0m9SGMwCiQR977nKY9reKQahdT68g" data-super-full-width="3175" data-super-full-height="3000"        data-sigil="thumb">\n        <i></i><img    width="150" height="142" alt="Mane Six X Royal Princesses Breeding Chart (OPEN) by RedTsukini" src="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fit/w_150,h_150,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-150.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ" data-src="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fit/w_150,h_150,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-150.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ" srcset="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fit/w_150,h_150,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-150.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ 150w,https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fill/w_265,h_250,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-250t.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ 265w,https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fill/w_370,h_350,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-350t.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ 370w,https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fill/w_423,h_400,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-400t.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ 423w,https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/88f7124d-a8b6-4ef6-8e9a-036ff0978d72/dfpt96m-6c678f4e-60e7-4d52-85d0-ce387f09c3bb.png/v1/fill/w_920,h_869,q_70,strp/mane_six_x_royal_princesses_breeding_chart__open__by_redtsukini_dfpt96m-pre.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MzAwMCIsInBhdGgiOiJcL2ZcLzg4ZjcxMjRkLWE4YjYtNGVmNi04ZTlhLTAzNmZmMDk3OGQ3MlwvZGZwdDk2bS02YzY3OGY0ZS02MGU3LTRkNTItODVkMC1jZTM4N2YwOWMzYmIucG5nIiwid2lkdGgiOiI8PTMxNzUifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.LVk6INJULqSmFJpiOYzV2PXU_Bpx5B_zUuPwrT8X7OQ 920w" sizes="150px"></a></span>\x3C!-- ^TTT -->\x3C!-- TTT$ --></span>',
];

for (const test of tests) {
  console.log("=".repeat(150));
  console.log(convertHtmlToMarkdown(test, "derpibooru"));
  console.log("=".repeat(150));
  console.log(convertHtmlToMarkdown(test, "manebooru"));
}
