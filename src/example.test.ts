import { Collection, Entity, Filter, ManyToMany, ManyToOne, MikroORM, PrimaryKey, Property } from '@mikro-orm/sqlite';

let orm: MikroORM;

@Entity({ abstract: true })
abstract class Base {
    @PrimaryKey()
    id!: number;
}

@Entity()
class Account extends Base {
    @Property()
    name!: string;
}

@Entity()
@Filter({
    cond: () => ({ account: { id: { $in: [1] } } }),
    name: "accounts"
})
class Car extends Base {
    @Property()
    brand!: string;

    @ManyToOne({
        deleteRule: "cascade",
        entity: () => Account,
        nullable: false,
    })
    account!: Account;

    @ManyToMany(() => Tag)
    tags: Collection<Tag> = new Collection<Tag>(this);
}
@Entity()
class Tag extends Base {
    @ManyToOne({
        deleteRule: "cascade",
        entity: () => Account,
        nullable: true,
    })
    account!: Account | null;

    @Property()
    name!: string;
}

const buildEnv = async () => {
    const account: Account = orm.em.create(Account, { id: 1, name: 'Car enjoyer 123' });
    await orm.em.flush();

    const tag: Tag = orm.em.create(Tag, { id: 1, name: "super fast", account: account });
    await orm.em.flush();

    orm.em.create(Car, { id: 1, account: account, brand: "audi", tags: [tag] });
    await orm.em.flush();
    orm.em.clear()
}

beforeAll(async () => {
    orm = await MikroORM.init({
        dbName: ':memory:',
        entities: [Base, Account, Tag, Car],
        debug: ['query', 'query-params'],
        loadStrategy: "select-in",
        allowGlobalContext: true, // only for testing
    });
    await orm.schema.refreshDatabase();
    await buildEnv();
});

afterAll(async () => {
    await orm.close(true);
});

test('this works', async () => {
    // using filter on Tag without logical operators
    orm.em.addFilter("accounts", () => ({ account: { id: { $in: [1] } } }), Tag);
    const cars: Array<Car> = await orm.em.getRepository(Car)
        .find({
            $and: [
                { brand: "audi" },
                { tags: { name: "super fast" } }
            ]
        }, { populate: ["account", "tags.account"], filters: ["accounts"] });

    expect(cars.length).toEqual(1);

    orm.em.clear();
})

test('this also works', async () => {
    // using filter on Tag with logical operator
    orm.em.addFilter("accounts", () => (({ account: { $and: [{ id: { $in: [1] } }, { id: { $eq: null } }] } })), Tag);
    const cars: Array<Car> = await orm.em.getRepository(Car)
        .find({
            $and: [
                { brand: "audi" },
            ]
        }, { populate: ["account", "tags.account"], filters: ["accounts"] });

    expect(cars.length).toEqual(1);

    orm.em.clear();
})

test('reproduce bug', async () => {
    // using filter on Tag with logical operator
    orm.em.addFilter("accounts", () => (({ account: { $and: [{ id: { $in: [1] } }, { id: { $eq: null } }] } })), Tag);
    /*
        select 
            `c0`.* 
        from 
            `car` as `c0` 
            left join `car_tags` as `c2` on `c0`.`id` = `c2`.`car_id` 
            left join `tag` as `c1` on `c2`.`tag_id` = `c1`.`id` 
                and `c1`.`account_id` = '{"$or":[{"id":{"$in":[1]}},{"id":{"$eq":null}}]}' 
        where 
            `c0`.`account_id` in (1) 
            and `c0`.`brand` = 'audi' 
            and `c1`.`id` in (1)
    */
    const cars: Array<Car> = await orm.em.getRepository(Car)
        .find({
            $and: [
                { brand: "audi" },
                { tags: { name: "super fast" } }
            ]
        }, { populate: ["account", "tags.account"], filters: ["accounts"] });

    expect(cars.length).toEqual(1);

    orm.em.clear()
});
