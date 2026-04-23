import { Router, Request, Response } from "express";
import { getZapSupportedAssetsPayload } from "../config/zapAssetsConfig";
import { getZapQuote, type ZapQuoteBody } from "../services/zapQuote";

const router = Router();

router.get("/supported-assets", (_req: Request, res: Response) => {
  try {
    res.json(getZapSupportedAssetsPayload());
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : "Supported assets configuration is unavailable.",
    });
  }
});

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const b = req.body as Partial<ZapQuoteBody>;
    if (
      !b.inputTokenContract ||
      !b.vaultTokenContract ||
      b.amountInStroops === undefined
    ) {
      res.status(400).json({
        error:
          "Expected inputTokenContract, vaultTokenContract, amountInStroops",
      });
      return;
    }

    const body: ZapQuoteBody = {
      inputTokenContract: String(b.inputTokenContract),
      vaultTokenContract: String(b.vaultTokenContract),
      amountInStroops: String(b.amountInStroops),
      inputDecimals: Number(b.inputDecimals ?? 7),
      vaultDecimals: Number(b.vaultDecimals ?? 7),
    };

    if (!/^-?\d+$/.test(body.amountInStroops)) {
      res.status(400).json({ error: "amountInStroops must be an integer string" });
      return;
    }

    const quote = await getZapQuote(body);
    res.json({
      path: quote.path,
      expectedAmountOutStroops: quote.expectedAmountOutStroops,
      source: quote.source,
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Quote failed",
    });
  }
});

export default router;
