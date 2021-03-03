import { VSCodeContributePoint, Contributes } from '../../../common';
import { Injectable, Autowired } from '@ali/common-di';
import { EditorComponentRegistry, ReactEditorComponent } from '@ali/ide-editor/lib/browser';
import { ICustomEditorOptions } from '../../../common/vscode';
import React = require('react');
import { useInjectable, IEventBus } from '@ali/ide-core-browser';
import { IActivationEventService } from '../../types';
import { CancellationTokenSource, Disposable, ILogger } from '@ali/ide-core-common';
import { IWebviewService } from '@ali/ide-webview';
import { CustomEditorScheme, CustomEditorShouldDisplayEvent, CustomEditorShouldHideEvent, CustomEditorOptionChangeEvent, CustomEditorShouldSaveEvent, CustomEditorShouldRevertEvent, CustomEditorShouldEditEvent } from '../../../common/vscode/custom-editor';
import { WebviewMounter } from '@ali/ide-webview/lib/browser/editor-webview';
import { match } from '../../../common/vscode/glob';

@Injectable()
@Contributes('customEditors')
export class CustomEditorContributionPoint extends VSCodeContributePoint<CustomEditorScheme[]> {
  @Autowired(EditorComponentRegistry)
  private editorComponentRegistry: EditorComponentRegistry;

  @Autowired(ILogger)
  logger: ILogger;

  @Autowired(IEventBus)
  eventBus: IEventBus;

  private options = new Map<string, ICustomEditorOptions>();

  contribute() {
    const customEditors = this.json || [];
    customEditors.forEach((c) => {
      this.registerSingleCustomEditor(c);
    });
    this.addDispose(this.eventBus.on(CustomEditorOptionChangeEvent, (e) => {
      if (this.options.has(e.payload.viewType)) {
        this.options.set(e.payload.viewType, e.payload.options);
      }
    }));
  }

  getOptions(viewType: string) {
    return this.options.get(viewType) || {};
  }

  private registerSingleCustomEditor(customEditor: CustomEditorScheme) {
    try {
      const viewType = customEditor.viewType;
      this.options.set(customEditor.viewType, {});
      const componentId = 'vscode_customEditor_' + customEditor.viewType;
      const component = createCustomEditorComponent(customEditor.viewType, componentId, () => {
        return this.getOptions(customEditor.viewType);
      });
      this.addDispose(this.editorComponentRegistry.registerEditorComponent({
        uid: componentId,
        component,
      }));

      const patterns = customEditor.selector.map((s) => {
        return s.filenamePattern;
      }).filter((p) => typeof p === 'string');

      if (patterns.length === 0) {
        return;
      }
      const priority: 'default' | 'option' = customEditor.priority || 'default';
      this.addDispose(this.editorComponentRegistry.registerEditorComponentResolver(() => 10,  (resource, results) => {
        for (const pattern of patterns) {

          // TODO: 这个match 规则可能需要再好好研究下。。vscode里面也没说
          if (match(pattern, resource.uri.path.toString().toLowerCase()) || match(pattern, resource.uri.path.base.toLowerCase())) {
            results.push({
              componentId,
              type: 'component',
              title: customEditor.displayName || customEditor.viewType,
              // TODO: 根据用户配置调整
              weight: priority === 'default' ? Number.MAX_SAFE_INTEGER : 0,
              saveResource: (resource) => {
                return this.eventBus.fireAndAwait(new CustomEditorShouldSaveEvent({
                  uri: resource.uri,
                  viewType,
                  cancellationToken: new CancellationTokenSource().token,
                }));
              },
              revertResource: (resource) => {
                return this.eventBus.fireAndAwait(new CustomEditorShouldRevertEvent({
                  uri: resource.uri,
                  viewType,
                  cancellationToken: new CancellationTokenSource().token,
                }));
              },
              undo: (resource) => {
                return this.eventBus.fireAndAwait(new CustomEditorShouldEditEvent({
                  uri: resource.uri,
                  viewType,
                  type: 'undo',
                }));
              },
              redo: (resource) => {
                return this.eventBus.fireAndAwait(new CustomEditorShouldEditEvent({
                  uri: resource.uri,
                  viewType,
                  type: 'redo',
                }));
              },
            });
          }
        }
      }));

    } catch (e) {
      this.logger.error(e);
    }

  }
}

export function createCustomEditorComponent(viewType: string, openTypeId: string, getOptions: () => ICustomEditorOptions): ReactEditorComponent<any> {

  return ({resource}) => {

    const activationEventService: IActivationEventService = useInjectable(IActivationEventService);
    const webviewService: IWebviewService = useInjectable(IWebviewService);
    const eventBus: IEventBus = useInjectable(IEventBus);
    let container: HTMLDivElement | null = null;

    React.useEffect(() => {
      const cancellationTokenSource = new CancellationTokenSource();
      const disposer = new Disposable();
      activationEventService.fireEvent('onCustomEditor', viewType).then(() => {
        if (cancellationTokenSource.token.isCancellationRequested) {
          return;
        }
        const webview = webviewService.createWebview(getOptions().webviewOptions);
        if (webview && container) {
          const mounter = new WebviewMounter(webview, container, document.getElementById('workbench-editor')!, document.getElementById('workbench-editor')!);
          webview.onRemove(() => {
            mounter.dispose();
          });
          disposer.addDispose({
            dispose: () => {
              webview.remove();
              webview.dispose();
              eventBus.fire(new CustomEditorShouldHideEvent({
                uri: resource.uri,
                viewType,
              }));
            },
          });
          eventBus.fire(new CustomEditorShouldDisplayEvent({
            uri: resource.uri,
            viewType,
            webviewPanelId: webview.id,
            cancellationToken: cancellationTokenSource.token,
            openTypeId,
          }));
        }
      });

      return () => {
        disposer.dispose();
        cancellationTokenSource.cancel();
      };

    }, []);

    return <div style={{height: '100%', width: '100%', position: 'relative' }} className='editor-webview-webview-component' ref = {(el) => container = el}></div>;
  };
}