import { Body, Controller, Get, HttpException, Logger, Post } from '@nestjs/common';
import { catchError } from 'rxjs/operators';

import { AppService } from './app.service';



@Controller()
export class AppController {
  private readonly logger = new Logger('PublisherAppService');
  
  constructor(private readonly appService: AppService) {}

  @Post('test-endpoint')
  async publishMeedanReports(@Body() body){
    const id = body['id'];
    return this.appService.publishReportById(id).pipe(
      catchError(err => {
        this.logger.error(err)
        throw new HttpException(err.message, 500);
      })
    );
  }

  @Post('publish-webhook')
  async publishWebHook(@Body() body){
    try{
      this.logger.log('body received: ', body);
      const parsed = body;
      const event = parsed.event;
      this.logger.log('received event: ', event);
      if(event === 'update_projectmedia'){
        const id = parsed.data.project_media.id;
        this.logger.log('item id: ', id);
        const logEdges = parsed.data.project_media.log.edges;
        const objectChanges = logEdges.length ? JSON.parse(logEdges[0].node.object_changes_json) : null;
        this.logger.log('object changes: ', objectChanges);
        const folderId = objectChanges && objectChanges['project_id'] ? objectChanges['project_id'][1] : null;
        this.logger.log('folder id: ', folderId);
        const referenceFolderId = process.env.CHECK_FOLDER_ID;
        this.logger.log('reference folder id: ', referenceFolderId);
        if(folderId && folderId === referenceFolderId){
          this.logger.log('publishing post...');
          return this.appService.publishReportById(id).pipe(
            catchError(err => {
              this.logger.error(err);
              throw new HttpException(err.message, 500);
            })
          );
        }
      }
      return null;
    }catch(e){
      this.logger.error(e);
      throw new HttpException(e.message, 500);
    }
  }
}

// example log:
// "log": {
//   "edges": [
//     {
//       "node": {
//         "event_type": "update_projectmedia",
//         "object_changes_json": "{\"project_id\":[null,987]}"
//       }
//     }
//   ]
// }
