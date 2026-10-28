import { describe, expect, it } from "vitest";
import {
  buildCheckpoint,
  compactMessages,
  parseCheckpoint,
  repairTranscript,
  MAX_CHECKPOINT_CHARS,
  type AgentMessage,
} from "@/lib/agents/checkpoint";

const sys: AgentMessage = { role: "system", content: "system" };
const task: AgentMessage = { role: "user", content: "задача" };

function toolRound(id: string, result = "ok"): AgentMessage[] {
  return [
    { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "listFiles", arguments: "{}" } }] },
    { role: "tool", tool_call_id: id, content: result },
  ];
}

describe("repairTranscript", () => {
  it("оставляет корректный транскрипт без изменений", () => {
    const messages = [sys, task, ...toolRound("a"), ...toolRound("b")];
    expect(repairTranscript(messages)).toEqual(messages);
  });

  it("убирает вызов инструмента без ответа (обрыв посреди шага)", () => {
    const dangling: AgentMessage = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "x", type: "function", function: { name: "browserClick", arguments: "{}" } }],
    };
    const result = repairTranscript([sys, task, ...toolRound("a"), dangling]);
    expect(result).toEqual([sys, task, ...toolRound("a")]);
  });

  it("убирает вызов, у которого ответили не на все tool_calls", () => {
    const two: AgentMessage = {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "p", type: "function", function: { name: "listFiles", arguments: "{}" } },
        { id: "q", type: "function", function: { name: "listFiles", arguments: "{}" } },
      ],
    };
    const result = repairTranscript([sys, task, two, { role: "tool", tool_call_id: "p", content: "1" }]);
    expect(result).toEqual([sys, task]);
  });

  it("выбрасывает осиротевшие tool-сообщения", () => {
    const result = repairTranscript([sys, task, { role: "tool", tool_call_id: "ghost", content: "?" }]);
    expect(result).toEqual([sys, task]);
  });
});

describe("compactMessages", () => {
  it("не трогает короткий транскрипт", () => {
    const messages = [sys, task, ...toolRound("a")];
    expect(compactMessages(messages)).toEqual(messages);
  });

  it("сохраняет system+задание и не начинает хвост с tool-сообщения", () => {
    const rounds = Array.from({ length: 40 }, (_, i) => toolRound(`id${i}`)).flat();
    const result = compactMessages([sys, task, ...rounds], 11);
    expect(result[0]).toEqual(sys);
    expect(result[1]).toEqual(task);
    expect(result[2]!.role).toBe("system");
    const firstTail = result[3]!;
    expect(firstTail.role).not.toBe("tool");
    // Каждый tool имеет своего assistant: транскрипт валиден.
    expect(repairTranscript(result)).toEqual(result);
  });
});

describe("buildCheckpoint / parseCheckpoint", () => {
  it("делает круговой обход и сохраняет номер шага", () => {
    const messages = [sys, task, ...toolRound("a")];
    const saved = buildCheckpoint(3, messages, new Date("2026-01-01T00:00:00Z"));
    const restored = parseCheckpoint(JSON.parse(JSON.stringify(saved)));
    expect(restored).not.toBeNull();
    expect(restored!.step).toBe(3);
    expect(restored!.messages).toEqual(messages);
  });

  it("не превышает предел размера даже при огромных результатах инструментов", () => {
    const huge = "я".repeat(120_000);
    const messages = [sys, task, ...Array.from({ length: 12 }, (_, i) => toolRound(`id${i}`, huge)).flat()];
    const saved = buildCheckpoint(12, messages);
    expect(JSON.stringify(saved.messages).length).toBeLessThanOrEqual(MAX_CHECKPOINT_CHARS);
    expect(repairTranscript(saved.messages)).toEqual(saved.messages);
  });

  it("отвергает повреждённые документы", () => {
    expect(parseCheckpoint(null)).toBeNull();
    expect(parseCheckpoint({})).toBeNull();
    expect(parseCheckpoint({ v: 999, step: 1, messages: [sys, task] })).toBeNull();
    expect(parseCheckpoint({ v: 1, step: -1, messages: [sys, task] })).toBeNull();
    expect(parseCheckpoint({ v: 1, step: 1, messages: [task, sys] })).toBeNull();
    expect(parseCheckpoint({ v: 1, step: 1, messages: [sys] })).toBeNull();
  });

  it("чинит висячий вызов при чтении точки из БД", () => {
    const dangling: AgentMessage = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "z", type: "function", function: { name: "browserNavigate", arguments: "{}" } }],
    };
    const restored = parseCheckpoint({ v: 1, step: 2, messages: [sys, task, dangling] });
    expect(restored!.messages).toEqual([sys, task]);
  });
});
