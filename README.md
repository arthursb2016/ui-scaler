# ui-scaler

Build your interface at a single resolution and let `ui-scaler` scale your `sizes`, `paddings`, `margins`, `font-sizes` and more across all screen resolutions. It works with a single line of code and pairs well with any library or framework that uses the **rem unit**.

In practice:

- Build your interface once for desktop (landscape) and it will look consistent across all desktop resolutions;
- Build your interface once for mobile (portrait) and it will look consistent across all mobile resolutions.

## Usage

Install the package:

```bash
npm i ui-scaler
```

Then call it in your app entry point:

```JavaScript
import scaleUI from 'ui-scaler'

scaleUI()
```

Options can be passed as a single object, for example `scaleUI({ baseFontSize: 14 })`.

## More information

Visit the official website: [uiscaler.com](https://uiscaler.com)

There you will find:

- Demo
- Installation examples
- SSR guidance
- Configuration options
- Changelog
