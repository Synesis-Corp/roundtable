import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UsagePage, { ScatterTooltipContent } from "./UsagePage";

// Mock the API client — UsagePage fetches /usage on mount and on period change.
const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock("../lib/api-client", () => ({
  apiGet: mockApiGet,
}));

// recharts renders into a sized container that jsdom can't measure; stub the
// pieces UsagePage uses so the dashboard mounts without canvas/layout noise.
vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    PieChart: Passthrough,
    Pie: () => null,
    Cell: () => null,
    ScatterChart: Passthrough,
    Scatter: () => null,
    ZAxis: () => null,
  };
});

const sampleResponse = {
  period: "all",
  rows: [
    {
      providerId: "openai",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      inputTokens: 1000,
      outputTokens: 2000,
      totalTokens: 3000,
      requestCount: 10,
      avgLatencyMs: 800,
      estimatedCostUsd: 1.23,
      hasBreakdown: true,
    },
  ],
  totals: {
    inputTokens: 1000,
    outputTokens: 2000,
    totalTokens: 3000,
    totalRequests: 10,
    totalCostUsd: 1.23,
    avgLatencyMs: 800,
  },
  insights: ["Tu modelo más usado es gpt-4o"],
};

// Route apiGet by endpoint: /providers returns the connected-providers list,
// everything else returns the usage payload.
function mockEndpoints(usage: unknown, providers: Array<{ providerId: string; isActive: boolean }>) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.startsWith("/providers")) return Promise.resolve(providers);
    return Promise.resolve(usage);
  });
}

describe("UsagePage", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("renders KPI cards when data is loaded", async () => {
    mockEndpoints(sampleResponse, [{ providerId: "openai", isActive: true }]);

    render(<UsagePage />);

    await waitFor(() => {
      expect(screen.getByText("Costo estimado")).toBeInTheDocument();
    });
    expect(screen.getByText("Total de tokens")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Latencia promedio")).toBeInTheDocument();
  });

  it("shows the empty state when the API returns no rows", async () => {
    mockEndpoints(
      {
        period: "all",
        rows: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalRequests: 0,
          totalCostUsd: 0,
          avgLatencyMs: 0,
        },
        insights: [],
      },
      [{ providerId: "openai", isActive: true }]
    );

    render(<UsagePage />);

    await waitFor(() => {
      expect(screen.getByText("Sin datos de uso")).toBeInTheDocument();
    });
  });

  it("re-fetches with period=30d when the toggle is clicked", async () => {
    mockEndpoints(sampleResponse, [{ providerId: "openai", isActive: true }]);

    render(<UsagePage />);

    // Wait for the initial load to finish so the period toggle is rendered.
    await waitFor(() => {
      expect(screen.getByText("Costo estimado")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("30 días"));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith("/usage?period=30d");
    });
  });

  it("hides rows from providers the user no longer has connected", async () => {
    // Usage history includes deepseek, but only openai is currently connected.
    const usage = {
      ...sampleResponse,
      rows: [
        sampleResponse.rows[0],
        {
          providerId: "deepseek",
          modelId: "deepseek-chat",
          displayName: "DeepSeek Chat",
          inputTokens: 500,
          outputTokens: 500,
          totalTokens: 1000,
          requestCount: 5,
          avgLatencyMs: 600,
          estimatedCostUsd: 0.5,
          hasBreakdown: true,
        },
      ],
    };
    mockEndpoints(usage, [{ providerId: "openai", isActive: true }]);

    render(<UsagePage />);

    await waitFor(() => {
      expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    });
    // deepseek usage must be filtered out of the detail table.
    expect(screen.queryByText("deepseek-chat")).not.toBeInTheDocument();
  });
});

describe("ScatterTooltipContent", () => {
  const row = {
    providerId: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    inputTokens: 1000,
    outputTokens: 2000,
    totalTokens: 3000,
    requestCount: 10,
    avgLatencyMs: 6300,
    estimatedCostUsd: 1.23,
    hasBreakdown: true,
  };

  it("renders nothing when inactive", () => {
    const { container } = render(<ScatterTooltipContent active={false} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders model display name, latency, tokens and requests", () => {
    render(<ScatterTooltipContent active payload={[{ payload: row }]} />);

    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getByText(/Latencia:/)).toBeInTheDocument();
    expect(screen.getByText("6.3s")).toBeInTheDocument();
    expect(screen.getByText(/Tokens:/)).toBeInTheDocument();
    expect(screen.getByText("3.0K")).toBeInTheDocument();
    expect(screen.getByText(/Requests:/)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("falls back to provider · model when displayName is missing", () => {
    render(
      <ScatterTooltipContent
        active
        payload={[{ payload: { ...row, displayName: "" } }]}
      />
    );
    expect(screen.getByText("openai · gpt-4o")).toBeInTheDocument();
  });
});
