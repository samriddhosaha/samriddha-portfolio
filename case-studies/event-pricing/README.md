# Event ticket demand and pricing

**Synthetic data. Illustrative. Not client work.** Every number here comes from `generate_data.py`, which invents a fictional 16-match event. It does not describe any real event, client, price or method.

Write-up with charts: `/work/event-pricing/` on the portfolio site.

## Run

```
pip install -r requirements.txt
python generate_data.py   # output/tickets.csv (seeded, reproducible)
python analyze.py         # tables, metrics.json and SVG charts in output/
```

## What it does

1. **Segment demand** by match tier x buyer segment x purchase window.
2. **Estimate price response**: one log-log least-squares regression per buyer segment (log tickets on log price, with tier, seat category and window controls). The price coefficient is the elasticity. Sold-out groups are excluded because seats, not demand, capped their sales.
3. **Forecast held-out matches** (13 to 16) with the prices actually charged, capped at seat capacity.
4. **Scenarios**: Low / Base / High scale demand by 0.85 / 1.00 / 1.15 (an assumption).
5. **Error**: WAPE on the held-out cells, versus a naive segment x window x category average.
6. **Sensitivity**: revenue change for price moves of -10% to +10% under three elasticity assumptions.

Because the generator's true elasticities are known (`TRUE_ELASTICITY` in `generate_data.py`), the analysis can check whether it recovers them.

## Limitations

The model has the same shape as the generator, so its accuracy is flattering. Prices vary at random here; in real sales they follow demand, which biases naive elasticity estimates. Elasticity is constant, there is no substitution or competition, only four matches are held out, and the +/-15% scenario range is assumed.
