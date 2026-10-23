import { act, render, type Screen } from "../../test/render";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { page, userEvent } from "vite-plus/test/browser";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
}));

import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  ProjectScriptEditorDialog,
  type ProjectScriptActionResult,
  type ProjectScriptEditorRequest,
} from "./projectScriptEditor";

const onSubmit = vi.fn<Parameters<typeof ProjectScriptEditorDialog>[0]["onSubmit"]>();
const onClose = vi.fn();
const onDelete = vi.fn();

function request(name: string, error?: string): ProjectScriptEditorRequest {
  return {
    scriptId: name,
    initial: { ...EMPTY_PROJECT_SCRIPT_INPUT, name, command: `run-${name}` },
    ...(error === undefined ? {} : { error }),
  };
}

const open = (screen: Screen, nextRequest: ProjectScriptEditorRequest) =>
  screen.rerender(
    <StrictMode>
      <ProjectScriptEditorDialog
        environmentId={EnvironmentId.make("test")}
        request={nextRequest}
        scripts={[]}
        onSubmit={onSubmit}
        onClose={onClose}
        onDelete={onDelete}
      />
    </StrictMode>,
  );

const submit = () => document.querySelector("form")!.requestSubmit();
const saveButton = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;

function deferredSave() {
  let resolve!: (result: ProjectScriptActionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ProjectScriptActionResult>((resolveResult, rejectResult) => {
    resolve = resolveResult;
    reject = rejectResult;
  });
  return { promise, resolve, reject };
}

function setup() {
  onSubmit.mockReset();
  onClose.mockReset();
  onDelete.mockReset();
}

describe("project action editor save lifecycle", () => {
  it("does not close a replacement request or release its in-flight save", async () => {
    setup();
    await using screen = await render(null);
    const first = deferredSave();
    const second = deferredSave();
    onSubmit.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await open(screen, request("build"));
    await act(async () => submit());

    await open(screen, request("test"));
    expect(saveButton().disabled).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#script-name")!.value).toBe("test");
    await act(async () => submit());

    await act(async () => first.resolve(AsyncResult.success(undefined)));
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(true);

    await act(async () => second.resolve(AsyncResult.success(undefined)));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls.map(([scriptId]) => scriptId)).toEqual(["build", "test"]);
  });
});

it("switches from shell to prompt, records a shortcut, and saves the prompt editor", async () => {
  setup();
  onSubmit.mockResolvedValue(AsyncResult.success(undefined));
  await using screen = await render(null);
  await open(screen, {
    scriptId: null,
    initial: { ...EMPTY_PROJECT_SCRIPT_INPUT, name: "Research status" },
  });
  await expect.element(page.getByLabelText("Command", { exact: true })).toBeVisible();
  await userEvent.click(page.getByRole("combobox", { name: "Action type" }));
  await userEvent.click(page.getByRole("option", { name: "Prompt", exact: true }));
  await expect.element(page.getByLabelText("Command", { exact: true })).not.toBeInTheDocument();
  await expect
    .element(page.getByText("Run automatically on worktree creation"))
    .not.toBeInTheDocument();
  await userEvent.type(
    page.getByLabelText("Prompt", { exact: true }),
    "Read instructions. Report results without edits.",
  );
  await userEvent.click(page.getByLabelText("Keybinding", { exact: true }));
  await userEvent.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  await expect
    .element(page.getByLabelText("Keybinding", { exact: true }))
    .toHaveValue("ctrl+shift+p");
  await act(async () => submit());
  await vi.waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        type: "prompt",
        prompt: "Read instructions. Report results without edits.",
        name: "Research status",
        keybinding: "ctrl+shift+p",
      }),
    ),
  );
});
