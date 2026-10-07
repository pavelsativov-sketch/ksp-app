declare module "cloudflare:workers" {
  export interface WorkflowStep {
    do<T>(
      name: string,
      config: { timeout?: string | number; retries?: { limit: number; delay: string | number } },
      callback: (context: unknown) => Promise<T>,
    ): Promise<T>;
  }

  export interface WorkflowEvent<T> {
    payload: T;
  }

  export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    protected ctx: unknown;
    constructor(ctx: unknown, env: Env);
    run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}
