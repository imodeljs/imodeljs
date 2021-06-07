# Adding showcase widgets to your iTwin Viewer

### Prerequisites

This tutorial assumes that you already have:

- Explored the [sample showcase](https://www.itwinjs.org/sample-showcase).
- Created a local [iTwin Web Viewer](https://github.com/iTwin/viewer) based on the template @itwin/web-viewer
- Configured your local source to open the "House Model" sample iModel.
  - Instructions to use this sample iModel can be found [here]($docs/learning/tutorials/create-test-imodel-sample/).
- Understand the concept of a [UI Provider]($docs/learning/ui/abstract/uiitemsprovider) and adding [widgets]($docs/reference/ui-abstract/uiitemsprovider/uiitemsprovider/).
- Completed ["Customizing the iTwin Viewer"]($docs/learning/tutorials/hello-world-viewer) tutorial.

### Goal

This tutorial will take widgets from the sample showcase and add them in to your iTwin Viewer using the ```uiProviders``` prop.

### Understanding the Sample Showcase

We hope you have given the [sample showcase](https://www.itwinjs.org/sample-showcase) a tour and enjoyed the many samples provided. You may want to use some of these samples in your own iTwin Viewer, and to do so you'll first need to understand how the showcase works.

If we take a closer look at the files involved in each sample, you'll notice they all follow the same pattern containing a few important files:

1. ```[SampleName]App.tsx``` - Corresponds to ```App.tsx``` in the iTwin Viewer template and provides the main ```Viewer``` component.
2. ```[SampleName]Widget.tsx``` - Defines the ```UiItemsProvider``` that will be passed into prop ```uiProviders``` for our sample widget component. This widget is the controller for our samples.
3. ```[SampleName]Api.ts``` - Defines widget functionality that uses the iTwin.js API being showcased.
4. ```[SampleName].scss``` - Defines the styles in our css classes used inside the widget.

Given this pattern, it's simple to identify the parts required to bring our sample showcase to your iTwin Viewer. The component revolves around the ```[SampleName]Widget.tsx``` file so we need to copy all the files associated with our custom widget's ```UiItemsProvider``` and pass it in the ```Viewer``` component.

### Example using a sample

For this tutorial, we'll be taking the widget from sample [View Attributes](https://www.itwinjs.org/sample-showcase/?group=Viewer&sample=view-attributes-sample&imodel=House+Sample) and adding it into our iTwin Viewer.

Starting with our entry file ```ViewAttributesApp.tsx```, the ```Viewer``` component is defined as follows:

``` jsx
<Viewer
  contextId={sampleIModelInfo.contextId}
  iModelId={sampleIModelInfo.iModelId}
  authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
  viewportOptions={viewportOptions}
  onIModelConnected={_oniModelReady}
  defaultUiConfig={default3DSandboxUi}
  theme="dark"
  uiProviders={uiProviders}
/>
```

The default iTwin Web Viewer only contains ```contextId```, ```iModelId``` and ```authConfig``` from the ```Viewer``` component. The only additional prop you'll need to add in your iTwin Viewer is prop ```uiProviders``` to use our widget, the other props are used to prepare the sample in our showcase.
Prop ```uiProviders``` is passed in an array that contains the ```ViewAttributesWidgetProvider```, imported and defined at the top of the file:

``` jsx
import { ViewAttributesWidgetProvider } from "./ViewAttributesWidget";
...
const uiProviders = [new ViewAttributesWidgetProvider()];
```

To sum it up, these three lines are the only lines you'll need to add in your iTwin Viewer in ```App.tsx```:

``` jsx
... // Import the widget provider
import { ViewAttributesWidgetProvider } from "./ViewAttributesWidget";
... // Construct the widget provider
const uiProviders = [new ViewAttributesWidgetProvider()];
... // A Prop passed into the <Viewer> component
uiProviders={uiProviders}
```

We now have made all the necessary coding modifications to our iTwin Viewer. We'll just need to copy the remaining three files to bring our widget over.

- ```ViewAttributesApi.ts```
- ```ViewAttributesWidget.tsx```
- ```ViewAttributes.scss```

For this tutorial, these files will be placed directly in our src directory so your file structure should look similar to this:

![ViewAttributesStructure]($docs/learning/tutorials/images/sample_viewer_port_to_itwin_viewer.png)

Running our iTwin Viewer now, you'll notice the same fully functional widget from the sample showcase in your iTwin Viewer.

![ViewAttributesResults]($docs/learning/tutorials/images/view_attributes_ported_results.png)

Feel free to customize these widgets to your liking.

### Multiple ways to extend uiProviders

If you already have a ```uiProviders``` prop passed in or would like to add more widgets from the sample showcase, the  ```uiProviders``` prop takes in an array of providers. Extending the widget is as simple as appending to your array.

You can add to the uiProviders const variable, i.e.:

``` jsx
const uiProviders = [new ViewAttributesWidgetProvider(), new HyerModelingWidgetProvider(), ...]
```

or ignore the variable completely and pass the array in directly:

``` jsx
<Viewer
  contextId={sampleIModelInfo.contextId}
  iModelId={sampleIModelInfo.iModelId}
  authConfig={{ oidcClient: AuthorizationClient.oidcClient }}
  viewportOptions={viewportOptions}
  onIModelConnected={_oniModelReady}
  defaultUiConfig={default3DSandboxUi}
  theme="dark"
  uiProviders={[new ViewAttributesWidgetProvider(), new HyperModelingWidgetProvider(), ...]}
/>
```

Just remember to copy corresponding files to your source.

If you'd like to use an existing UiItemsProvider instead of passing in multiple new ones, just add the widget in your ```provideWigets()``` function along with copying and pasting the react component to your desired location:

``` jsx
export class MyCustomUiProvider extends UiItemsProvider
{
  ... // Your custom code
  public provideWidgets(_stageId: string, _stageUsage: string, location: StagePanelLocation, _section?: StagePanelSection): ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    if (location === StagePanelLocation.Right) {
      widgets.push(
        {
          id: "ViewAttributesWidget",
          label: "View Attributes Controls",
          defaultState: WidgetState.Floating,
          getWidgetContent: () => <ViewAttributesWidget />, // Don't forget to copy code for the ViewAttributesWidget
        }
      );
    }
}
```

As you can see, extending your iTwin Viewer with multiple widgets is simple.
It's completely up to you on how you want to structure your directories and components. Feel free to extend as many widgets as you like.

## Useful Links

- [UI Provider]($docs/reference/ui-abstract/uiitemsprovider/uiitemsprovider/)
- [View Attributes Sample](https://www.itwinjs.org/sample-showcase/?group=Viewer&sample=view-attributes-sample&imodel=House+Sample)
- [Sample Showcase](https://www.itwinjs.org/sample-showcase/)

