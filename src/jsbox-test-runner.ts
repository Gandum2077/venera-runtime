import { BaseController, Button, Label, Progress, Text } from "jsbox-cview";
import {
  DEFAULT_NETWORK_TEST_URL,
  formatTestReportMarkdown,
  runApiTestSuite,
  RuntimeTestReport,
  RuntimeTestResult,
} from "./api-test-suite";
import { runtimeFiles } from "./platform";

const REPORT_MARKDOWN_PATH = "shared://venera-runtime-api-report.md";
const REPORT_JSON_PATH = "shared://venera-runtime-api-report.json";

function formatResultLine(result: RuntimeTestResult): string {
  const icon =
    result.status === "passed" ? "✓" : result.status === "failed" ? "✗" : "–";
  return `${icon} ${result.name}${result.detail ? `\n  ${result.detail.split("\n")[0]}` : ""}`;
}

class TestReportController extends BaseController {
  private readonly statusLabel: Label;
  private readonly progress: Progress;
  private readonly reportText: Text;
  private readonly previewButton: Button;
  private readonly shareButton: Button;
  private report: RuntimeTestReport | null = null;
  private lines: string[] = [];

  constructor() {
    super({
      props: { bgcolor: $color("primarySurface") },
      events: {
        didLoad: () => {
          void this.runTests();
        },
      },
    });

    this.statusLabel = new Label({
      props: {
        text: "Preparing runtime tests…",
        font: $font("bold", 20),
        textColor: $color("primaryText"),
        lines: 2,
      },
      layout: (make, view) => {
        make.top.equalTo(view.super.safeArea).offset(18);
        make.left.right.inset(20);
      },
    });

    this.progress = new Progress({
      props: { value: 0, progressColor: $color("tintColor") },
      layout: (make, view) => {
        make.top.equalTo($(this.statusLabel.id).bottom).offset(12);
        make.left.right.inset(20);
        make.height.equalTo(4);
      },
    });

    this.reportText = new Text({
      props: {
        text: "",
        editable: false,
        selectable: true,
        font: $font("Menlo", 13),
        textColor: $color("primaryText"),
        bgcolor: $color("secondarySurface"),
        radius: 10,
        insets: $insets(12, 12, 12, 12),
      },
      layout: (make, view) => {
        make.top.equalTo($(this.progress.id).bottom).offset(16);
        make.left.right.inset(16);
        make.bottom.equalTo(view.super.safeArea).inset(74);
      },
    });

    this.previewButton = new Button({
      props: {
        title: "Preview report",
        bgcolor: $color("tintColor"),
        titleColor: $color("white"),
        radius: 9,
        enabled: false,
      },
      layout: (make, view) => {
        make.left.inset(16);
        make.bottom.equalTo(view.super.safeArea).inset(14);
        make.height.equalTo(44);
        make.right.equalTo(view.super.centerX).offset(-6);
      },
      events: {
        tapped: () => this.previewReport(),
      },
    });

    this.shareButton = new Button({
      props: {
        title: "Share files",
        bgcolor: $color("secondarySurface"),
        titleColor: $color("tintColor"),
        radius: 9,
        enabled: false,
      },
      layout: (make, view) => {
        make.right.inset(16);
        make.bottom.equalTo(view.super.safeArea).inset(14);
        make.height.equalTo(44);
        make.left.equalTo(view.super.centerX).offset(6);
      },
      events: {
        tapped: () => this.shareReports(),
      },
    });

    this.rootView.views = [
      this.statusLabel,
      this.progress,
      this.reportText,
      this.previewButton,
      this.shareButton,
    ];
  }

  private async runTests(): Promise<void> {
    this.lines = ["venera-runtime · Venera 1.6.3 · iOS", ""];
    this.reportText.view.text = this.lines.join("\n");
    const report = await runApiTestSuite({
      networkUrl: DEFAULT_NETWORK_TEST_URL,
      onProgress: (completed, total, result) => {
        this.lines.push(formatResultLine(result));
        this.reportText.view.text = this.lines.join("\n\n");
        this.progress.view.value = completed / total;
        this.statusLabel.view.text = `Running ${completed} of ${total}`;
      },
    });
    this.report = report;
    const markdown = formatTestReportMarkdown(report);
    runtimeFiles.writeText(REPORT_MARKDOWN_PATH, markdown);
    runtimeFiles.writeText(
      REPORT_JSON_PATH,
      `${JSON.stringify(report, null, 2)}\n`,
    );

    this.statusLabel.view.text =
      report.totals.failed === 0
        ? `${report.totals.passed} passed · ${report.totals.skipped} skipped`
        : `${report.totals.failed} failed · ${report.totals.passed} passed`;
    this.statusLabel.view.textColor =
      report.totals.failed === 0 ? $color("#248A3D") : $color("#D70015");
    this.previewButton.view.enabled = true;
    this.shareButton.view.enabled = true;
    this.lines.push(
      "",
      `Reports saved to:\n${REPORT_MARKDOWN_PATH}\n${REPORT_JSON_PATH}`,
    );
    this.reportText.view.text = this.lines.join("\n\n");
  }

  private previewReport(): void {
    if (!this.report) return;
    $quicklook.open({ text: formatTestReportMarkdown(this.report) });
  }

  private shareReports(): void {
    const markdown = $file.read(REPORT_MARKDOWN_PATH);
    const json = $file.read(REPORT_JSON_PATH);
    if (!markdown || !json) {
      $ui.toast("Report files are missing");
      return;
    }
    $share.sheet({
      items: [
        { name: "jsbox-api-report.md", data: markdown },
        { name: "jsbox-api-report.json", data: json },
      ],
      handler: (success: boolean) => {},
    });
  }
}

const controller = new TestReportController();
controller.uirender({
  title: "Runtime API Tests",
  navBarHidden: true,
  statusBarStyle: 0,
});
