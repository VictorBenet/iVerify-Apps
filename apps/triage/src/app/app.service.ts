import { HttpException, HttpService, Injectable } from '@nestjs/common';
import { CrowdtangleClientService } from 'libs/crowdtangle-client/src/lib/crowdtangle-client.service';
import { MeedanCheckClientService, ToxicityScores } from '@iverify/meedan-check-client';
import { MlServiceClientService } from 'libs/ml-service-client/src/lib/ml-service-client.service';
import { BehaviorSubject, combineLatest, from, Observable, of } from 'rxjs';
import { catchError, concatMap, filter, map, scan, switchMap, take, tap, withLatestFrom } from 'rxjs/operators';
import { TriageConfig } from './config';

@Injectable()
export class AppService {
  offset = new BehaviorSubject<{offset: number, iterations: number}>({offset: 0, iterations: 0});
  offset$ = this.offset.asObservable();
  
  listsIds$: Observable<any> = this.ctClient.getLists().pipe(
    map(lists => lists.filter(list => list.type === 'SAVED_SEARCH')),
    map(lists => lists.map(list => list.id)),
    catchError(err => {
      throw new HttpException(err.message, 500);
    })
  )

  posts$: Observable<any> = this.listsIds$.pipe(
    switchMap(listsIds => from(listsIds)),
    concatMap(listId => combineLatest([of(listId), this.offset$])),
    map(([listId, offset]) => ({listId, offset})),
    tap(data => {
      console.log('listid: ', data.listId);
      console.log('offset: ', data.offset.offset);
      console.log('iteration: ', data.offset.iterations)
    }),
    concatMap(data => this.ctClient.getPosts(data.listId.toString(), data.offset.offset)),
    withLatestFrom(this.offset$),
    map(([res, offset]) => ({res, offset})),
    tap(data => {
      if(!!data.res.pagination && !!data.res.pagination.nextPage) {
        const iterations = data.offset.iterations + 1;
        const offset = 10 * iterations;
        this.offset.next({offset, iterations})
      }
      else this.offset.complete();
    }),
    map(data => data.res.posts),
    scan((acc, val) => [...acc, ...val], []),
    tap(data => console.log('posts lenght: ', data.length)),
    catchError(err => {
      throw new HttpException(err.message, 500);
    })
  )

  analyzedPosts$: Observable<any> = this.posts$.pipe(
    switchMap(posts => from(posts)),
    concatMap(post => {
      const toxicScores$: Observable<any> = this.analyzePost(post);
      return combineLatest([of(post) as Observable<Object>, toxicScores$])
    }),
    map(([post, toxicScores]) => {
      console.log('Post id: ', post['id'])
      console.log('Toxic score: ', toxicScores)
      return {post, toxicScores}
    }),
    filter(data => !!this.isToxic(data.toxicScores)),
    concatMap(data => {
      return this.checkClient.createItem(data.post['postUrl'], data.toxicScores);
    }),
    scan((acc, val) => {
      return [...acc, val]
    }, []),
    tap(result => console.log('result length...: ', result.length)),
    catchError(err => {
      throw new HttpException(err.message, 500);
    })
  )

  constructor(
    private ctClient: CrowdtangleClientService, 
    private mlClient: MlServiceClientService,
    private checkClient: MeedanCheckClientService,
    private config: TriageConfig
    ){}
  analyze() {
    return this.analyzedPosts$;
  }

  private analyzePost(post: any): Observable<any>{
    const message = post.message;
    return this.mlClient.analyze([message])
  }

  private isToxic(toxicScores: ToxicityScores): Boolean{
    return Object.keys(toxicScores).reduce((acc, val) => {
      if(toxicScores[val] > this.config.toxicTreshold) acc = true;
      return acc;
    }, false)
  }
}
