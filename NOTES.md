# Split-Toe Simulator Prototype Notes

Question: can a static web page make the split-toe formula physically legible without adding old Volvo/XC60 specs or overfit terms?

Current answer: yes. The page keeps the accepted split-toe model separate from total toe, shows `dmF`, `dmR`, and `dC` as signed imbalance vectors, animates the resulting toe split on a four-wheel car diagram, and exposes the `dmF*dmR` rear term only as a research diagnostic.

The diagnostic term remains rejected as an operational formula because it is mirror-even: swapping left and right should flip split toe, but `dmF*dmR` does not flip sign by itself.
